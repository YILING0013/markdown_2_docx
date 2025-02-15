import os
import re
import base64
import subprocess
import tempfile
import uuid

from flask import Flask, render_template, request, send_file, make_response, jsonify
import markdown  # 用于预览时把 markdown 转为 HTML
import pypandoc  # 用于导出 docx/pdf

# 需要安装的依赖：
# pip install pygments pymdown-extensions

try:
    from weasyprint import HTML
    WEASYPRINT_AVAILABLE = True
except ImportError:
    WEASYPRINT_AVAILABLE = False

app = Flask(__name__)

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
    with tempfile.NamedTemporaryFile(suffix=".mmd", delete=False) as f_in:
        f_in.write(mermaid_code.encode('utf-8'))
        mmd_path = f_in.name

    png_path = mmd_path.replace(".mmd", ".png")

    cmd = ["mmdc", "-i", mmd_path, "-o", png_path]
    subprocess.run(cmd, check=True)

    with open(png_path, 'rb') as f:
        data = f.read()

    os.remove(mmd_path)
    os.remove(png_path)

    return base64.b64encode(data).decode('utf-8')

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
    导出文件为 docx 或 pdf。
    """
    md_text = request.form.get('markdown_input', '')
    export_type = request.args.get('type', 'docx')

    # 替换 \[1mm] => \vspace{1mm}
    md_text = re.sub(r'\\\[1mm\]', r'\\vspace{1mm}', md_text)

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

    with tempfile.NamedTemporaryFile(suffix=".md", delete=False) as f_in:
        f_in.write(cleaned_md.encode('utf-8'))
        md_path = f_in.name

    output_file = md_path + "." + export_type

    # 增加 +raw_tex+tex_math_double_backslash
    # 移除 --mathml，减少对LaTeX命令的干扰
    extra_args_for_pdf = [
        "--lua-filter=mermaid_filter.lua",
        "--pdf-engine=xelatex",
        "-V", "mainfont=Noto Sans CJK SC",
        "--highlight-style=pygments",
        "-f", "markdown+raw_tex+tex_math_dollars+tex_math_double_backslash"
    ]
    extra_args_for_docx = [
        "--lua-filter=mermaid_filter.lua",
        "--highlight-style=pygments",
        "--reference-doc=reference.docx",
        "-f", "markdown+raw_tex+tex_math_dollars+tex_math_double_backslash"
    ]

    try:
        if export_type == 'docx':
            pypandoc.convert_file(
                md_path,
                'docx',
                outputfile=output_file,
                extra_args=extra_args_for_docx
            )
            resp = make_response(
                send_file(output_file, as_attachment=True, download_name="output.docx")
            )
            resp.headers['Content-Type'] = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

        elif export_type == 'pdf':
            pypandoc.convert_file(
                md_path,
                'pdf',
                outputfile=output_file,
                extra_args=extra_args_for_pdf
            )
            resp = make_response(
                send_file(output_file, as_attachment=True, download_name="output.pdf")
            )
            resp.headers['Content-Type'] = 'application/pdf'

        else:
            os.remove(md_path)
            return "未知的导出类型", 400

    except Exception as e:
        os.remove(md_path)
        if os.path.exists(output_file):
            os.remove(output_file)
        return jsonify({"error": str(e)}), 500

    os.remove(md_path)
    return resp

if __name__ == '__main__':
    app.run(debug=True, port=5000)