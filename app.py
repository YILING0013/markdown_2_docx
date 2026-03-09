import os
import re
import base64
import subprocess
import tempfile
import uuid
import requests
import atexit
import shutil

from flask import Flask, render_template, request, send_file, make_response, jsonify
import markdown  # 用于预览时把 markdown 转为 HTML
import pypandoc  # 用于导出 docx/pdf

# 需要安装的依赖：
# pip install pygments pymdown-extensions requests

try:
    from weasyprint import HTML
    WEASYPRINT_AVAILABLE = True
except ImportError:
    WEASYPRINT_AVAILABLE = False

app = Flask(__name__)

# Cloudflare Turnstile 配置
TURNSTILE_SECRET_KEY = '0x4AAAAAAXXXXXXXXXXXXXXXXXXXXXXXXX'
TURNSTILE_VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify'

# 临时文件跟踪
temp_files = set()
temp_dirs = set()

def cleanup_temp_files():
    """清理所有临时文件和目录"""
    for file_path in list(temp_files):
        try:
            if os.path.exists(file_path):
                os.remove(file_path)
            temp_files.discard(file_path)
        except Exception as e:
            print(f"清理临时文件失败 {file_path}: {e}")
    
    for dir_path in list(temp_dirs):
        try:
            if os.path.exists(dir_path):
                shutil.rmtree(dir_path)
            temp_dirs.discard(dir_path)
        except Exception as e:
            print(f"清理临时目录失败 {dir_path}: {e}")

# 注册退出时清理
atexit.register(cleanup_temp_files)

def verify_turnstile(token, remote_ip=None):
    """
    验证 Cloudflare Turnstile token
    """
    if not token:
        return False, "缺少验证令牌"
    
    data = {
        'secret': TURNSTILE_SECRET_KEY,
        'response': token
    }
    
    if remote_ip:
        data['remoteip'] = remote_ip
    
    try:
        response = requests.post(TURNSTILE_VERIFY_URL, data=data, timeout=10)
        result = response.json()
        
        if result.get('success'):
            return True, "验证成功"
        else:
            error_codes = result.get('error-codes', [])
            return False, f"验证失败: {', '.join(error_codes)}"
    except Exception as e:
        return False, f"验证请求失败: {str(e)}"

@app.route('/')
def index():
    """
    展示首页
    """
    return render_template('index.html')

def generate_mermaid_image(mermaid_code: str) -> str:
    """
    调用 mermaid-cli，将 mermaid_code 生成 PNG，并返回 base64 字符串。
    """
    # 创建临时目录
    temp_dir = tempfile.mkdtemp()
    temp_dirs.add(temp_dir)
    
    mmd_path = os.path.join(temp_dir, f"{uuid.uuid4()}.mmd")
    png_path = mmd_path.replace(".mmd", ".png")
    
    try:
        with open(mmd_path, 'w', encoding='utf-8') as f:
            f.write(mermaid_code)
        
        temp_files.add(mmd_path)
        temp_files.add(png_path)

        cmd = ["mmdc", "-i", mmd_path, "-o", png_path]
        subprocess.run(cmd, check=True, timeout=30)

        with open(png_path, 'rb') as f:
            data = f.read()

        return base64.b64encode(data).decode('utf-8')
    
    finally:
        # 立即清理这些临时文件
        for file_path in [mmd_path, png_path]:
            try:
                if os.path.exists(file_path):
                    os.remove(file_path)
                temp_files.discard(file_path)
            except:
                pass

@app.route('/preview', methods=['POST'])
def preview():
    """
    将用户输入的Markdown先预处理，再转为HTML。
    """
    md_text = request.form.get('markdown_input', '')

    # 保证 \[...\] 公式的前后有空行
    md_text = re.sub(r'([^\n])(\s*)\\\[(.*?)\\\]([^\n])',
                     r'\1\n\n\\[\3\\]\n\n\4', md_text, flags=re.DOTALL)
    md_text = re.sub(r'^(\s*)\\\[(.*?)\\\](\s*)(?=\n|$)',
                     r'\n\\[\2\\]\n', md_text, flags=re.MULTILINE|re.DOTALL)

    # 将 mermaid/flowchart/sequence 代码块替换为内嵌图像
    pattern = r'```(mermaid|sequence|flowchart)(.*?)```'
    def repl(match):
        mermaid_code = match.group(2).strip()
        try:
            b64 = generate_mermaid_image(mermaid_code)
            return f'\n![](data:image/png;base64,{b64})\n'
        except Exception as e:
            return f"\n**[Mermaid Error: {str(e)}]**\n"

    replaced_md = re.sub(pattern, repl, md_text, flags=re.DOTALL)

    # Markdown 转 HTML
    html = markdown.markdown(
        replaced_md,
        extensions=[
            'fenced_code',
            'codehilite',
            'tables',
            'nl2br',
            'pymdownx.arithmatex'
        ],
        extension_configs={
            'codehilite': {
                'linenums': False,
                'guess_lang': False,
            },
            'pymdownx.arithmatex': {
                'generic': True,
                'preview': False
            }
        }
    )

    return html

@app.route('/export', methods=['POST'])
def export():
    """
    导出文件为 docx，需要 Turnstile 验证。
    """
    export_type = request.args.get('type', 'docx')
    
    # 只有 docx 需要验证
    if export_type == 'docx':
        # 获取 Turnstile token
        turnstile_token = request.form.get('cf_turnstile_response')
        
        # 验证 Turnstile
        remote_ip = request.headers.get('X-Forwarded-For', request.remote_addr)
        success, message = verify_turnstile(turnstile_token, remote_ip)
        
        if not success:
            return jsonify({"error": f"安全验证失败: {message}"}), 403
    
    md_text = request.form.get('markdown_input', '')
    
    if not md_text.strip():
        return jsonify({"error": "Markdown内容不能为空"}), 400

    # 替换 \[1mm] => \vspace{1mm}
    md_text = re.sub(r'\\\[1mm\]', r'\\vspace{1mm}', md_text)

    # 同样为 \[...\] 公式加空行
    md_text = re.sub(r'([^\n])(\s*)\\\[(.*?)\\\]([^\n])',
                     r'\1\n\n\\[\3\\]\n\n\4', md_text, flags=re.DOTALL)
    md_text = re.sub(r'^(\s*)\\\[(.*?)\\\](\s*)(?=\n|$)',
                     r'\n\\[\2\\]\n', md_text, flags=re.MULTILINE|re.DOTALL)

    # 保留原始LaTeX公式，不做额外处理
    cleaned_md = re.sub(r'<span class="arithmatex">(.*?)</span>', r'\1', md_text)
    # 将行级公式由 \( \) => $ $
    cleaned_md = re.sub(r'\\\(', r'$', cleaned_md)
    cleaned_md = re.sub(r'\\\)', r'$', cleaned_md)
    # 将块级公式 \[ \] => $$ $$
    cleaned_md = re.sub(r'\\\[', r'$$', cleaned_md)
    cleaned_md = re.sub(r'\\\]', r'$$', cleaned_md)

    # 创建临时目录
    temp_dir = tempfile.mkdtemp()
    temp_dirs.add(temp_dir)
    
    md_path = os.path.join(temp_dir, f"{uuid.uuid4()}.md")
    output_file = os.path.join(temp_dir, f"output_{uuid.uuid4()}.{export_type}")
    
    temp_files.add(md_path)
    temp_files.add(output_file)

    try:
        with open(md_path, 'w', encoding='utf-8') as f:
            f.write(cleaned_md)

        # 检查是否存在 mermaid_filter.lua
        mermaid_filter = "mermaid_filter.lua"
        use_mermaid_filter = os.path.exists(mermaid_filter)
        
        # 检查是否存在 reference.docx
        reference_docx = "reference.docx"
        use_reference_docx = os.path.exists(reference_docx)

        if export_type == 'docx':
            extra_args = [
                "--highlight-style=pygments",
                "-f", "markdown+raw_tex+tex_math_dollars+tex_math_double_backslash"
            ]
            
            if use_mermaid_filter:
                extra_args.insert(0, f"--lua-filter={mermaid_filter}")
            
            if use_reference_docx:
                extra_args.append(f"--reference-doc={reference_docx}")

            pypandoc.convert_file(
                md_path,
                'docx',
                outputfile=output_file,
                extra_args=extra_args
            )
            
            # 读取文件内容
            with open(output_file, 'rb') as f:
                file_data = f.read()
            
            resp = make_response(file_data)
            resp.headers['Content-Type'] = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
            resp.headers['Content-Disposition'] = f'attachment; filename="markdown_export_{uuid.uuid4().hex[:8]}.docx"'

        else:
            return jsonify({"error": "未知的导出类型"}), 400

    except subprocess.CalledProcessError as e:
        return jsonify({"error": f"转换过程出错: {str(e)}"}), 500
    except Exception as e:
        return jsonify({"error": f"导出失败: {str(e)}"}), 500
    
    finally:
        # 清理临时文件
        for file_path in [md_path, output_file]:
            try:
                if os.path.exists(file_path):
                    os.remove(file_path)
                temp_files.discard(file_path)
            except Exception as e:
                print(f"清理文件失败 {file_path}: {e}")
        
        # 清理临时目录
        try:
            if os.path.exists(temp_dir):
                shutil.rmtree(temp_dir)
            temp_dirs.discard(temp_dir)
        except Exception as e:
            print(f"清理目录失败 {temp_dir}: {e}")

    return resp

if __name__ == '__main__':
    app.run(debug=True, port=5000)