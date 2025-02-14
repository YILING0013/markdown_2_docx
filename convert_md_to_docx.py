#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import os
import sys
import tempfile
import pypandoc

def main():
    if len(sys.argv) < 3:
        print("用法：python convert_md_to_docx.py <输入Markdown> <输出DOCX>")
        sys.exit(1)

    input_md = sys.argv[1]
    output_docx = sys.argv[2]

    # 检查 mermaid_filter.lua 是否存在
    mermaid_filter = "mermaid_filter.lua"
    if not os.path.exists(mermaid_filter):
        print(f"错误：{mermaid_filter} 文件未找到，请先创建或修改其路径。")
        sys.exit(1)

    # 检查 pygments.theme 是否存在
    highlight_theme = os.path.abspath("pygments.theme")
    if not os.path.exists(highlight_theme):
        print(f"警告：{highlight_theme} 文件未找到，将使用 Pandoc 内置高亮样式。")
        highlight_arg = "--highlight-style=pygments"  # 使用内置的pygments
    else:
        highlight_arg = f"--highlight-style={highlight_theme}"
    # highlight_arg = "--highlight-style=pygments"
    # 额外参数
    # --lua-filter=mermaid_filter.lua: 调用 Mermaid 转换
    # --mathml / --mathjax / --math-engine=...:
    #    Pandoc 默认在 docx 中会将 LaTeX 数学转换为 OMML，无需额外参数即可
    #    如果你的 Pandoc 版本老，可以加 --mathml 或 --math-engine=mathematica 等自定义。
    extra_args = [
        f"--lua-filter={mermaid_filter}",
        highlight_arg,
        # 还可以加上其它需要的参数
        # "--mathml",
    ]

    try:
        pypandoc.convert_file(
            source_file=input_md,
            to="docx",
            outputfile=output_docx,
            extra_args=extra_args
        )
        print(f"转换完成：{output_docx}")
    except OSError as e:
        print("调用 Pandoc 失败，请确认是否已安装 Pandoc。错误信息：", e)

if __name__ == "__main__":
    main()
