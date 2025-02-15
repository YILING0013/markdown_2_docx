# app.py
import os
import re
import base64
import subprocess
import tempfile
import uuid

from flask import Flask, render_template, request, send_file, make_response, jsonify
import markdown  # 用于预览时把 markdown 转为 HTML
import pypandoc  # 用于导出 docx/pdf

# 需要安装 pygments 以启用 codehilite
# pip install pygments

# 尝试导入 WeasyPrint，如果依赖库缺失，给出标志
try:
    from weasyprint import HTML
    WEASYPRINT_AVAILABLE = True
except ImportError:
    WEASYPRINT_AVAILABLE = False

app = Flask(__name__)

@app.route('/')
def index():
    """
    打开首页: 显示一个文本区让用户粘贴 Markdown, 并提供 预览 / 导出 按钮
    """
    return render_template('index.html')


def generate_mermaid_image(mermaid_code: str) -> str:
    """
    调用 mermaid-cli, 将 mermaid_code 生成 PNG 并返回 base64 字符串
    """
    # 创建临时文件来写入 mermaid 源码
    with tempfile.NamedTemporaryFile(suffix=".mmd", delete=False) as f_in:
        f_in.write(mermaid_code.encode('utf-8'))
        mmd_path = f_in.name

    # 生成对应的 PNG 文件路径
    png_path = mmd_path.replace(".mmd", ".png")

    # 调用命令行 "mmdc -i xxx.mmd -o xxx.png"
    cmd = ["mmdc", "-i", mmd_path, "-o", png_path]
    subprocess.run(cmd, check=True)

    # 读取生成的 PNG, 转为 base64
    with open(png_path, 'rb') as f:
        data = f.read()

    # 清理临时文件
    os.remove(mmd_path)
    os.remove(png_path)

    # 返回 base64 编码
    return base64.b64encode(data).decode('utf-8')


@app.route('/preview', methods=['POST'])
def preview():
    """
    接收 Markdown 文本，先将 mermaid/flowchart/sequence 的代码块转为内嵌 Base64 图像，
    然后用 Python-Markdown 转为 HTML 返回给前端展示。
    
    同时开启 codehilite 以便显示带有背景色的代码块。
    """
    md_text = request.form.get('markdown_input', '')

    # 利用正则找到 mermaid/flowchart/sequence 代码块: ```mermaid ... ```
    pattern = r'```(mermaid|sequence|flowchart)(.*?)```'

    def repl(match):
        mermaid_code = match.group(2).strip()
        # 调用 mermaid-cli 生成图
        try:
            b64 = generate_mermaid_image(mermaid_code)
            return f'\n![](data:image/png;base64,{b64})\n'  # 添加换行确保结构
        except Exception as e:
            # 如果生成图出错，则用提示替换
            return f"\n**[Mermaid Error: {str(e)}]**\n"

    replaced_md = re.sub(pattern, repl, md_text, flags=re.DOTALL)

    # 用 markdown 库进行转 HTML
    html = markdown.markdown(
        replaced_md,
        extensions=[
            'fenced_code',
            'codehilite',    # 启用代码高亮
            'tables',
            'nl2br'          # 可选：将换行转为 <br>
        ],
        extension_configs={
            'codehilite': {
                'linenums': False,      # 禁用行号
                'guess_lang': False,    # 禁用语言猜测
            }
        }
    )

    return html


@app.route('/export', methods=['POST'])
def export():
    """
    导出接口: 接收 Markdown 文本和一个类型参数(type=docx/pdf/image)，
    再调用 Pandoc/WeasyPrint 等转换并把生成文件作为下载返回。
    """
    md_text = request.form.get('markdown_input', '')
    export_type = request.args.get('type', 'docx')  # 默认为 docx

    # 先将输入写入一个临时文件
    with tempfile.NamedTemporaryFile(suffix=".md", delete=False) as f_in:
        f_in.write(md_text.encode('utf-8'))
        md_path = f_in.name

    # 拼出输出文件名
    output_file = md_path + "." + export_type

    # 需要传给 Pandoc 的额外参数
    extra_args_for_pdf = [
        "--lua-filter=mermaid_filter.lua",
        "--pdf-engine=xelatex",
        "-V", "mainfont=Noto Sans CJK SC",
        "--highlight-style=pygments"
    ]
    extra_args_for_docx = [
        "--lua-filter=mermaid_filter.lua",
        "--highlight-style=pygments",
        "--reference-doc=reference.docx"
    ]

    try:
        if export_type == 'docx':
            # 转为 docx
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
            # 转为 pdf
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
        # 捕获转换错误，给出提示
        os.remove(md_path)
        if os.path.exists(output_file):
            os.remove(output_file)
        return jsonify({"error": str(e)}), 500

    # 清理临时文件
    os.remove(md_path)
    return resp


if __name__ == '__main__':
    app.run(debug=True, port=5000)