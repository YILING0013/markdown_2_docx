// main.js

// 实时预览功能
let isPreviewing = false;
const previewContent = document.getElementById('preview_content');
const textarea = document.getElementById('markdown_input');

// 输入防抖处理
function debounce(fn, delay = 300) {
    let timer;
    return (...args) => {
        clearTimeout(timer);
        timer = setTimeout(() => fn.apply(this, args), delay);
    };
}

// 实时输入监听
textarea.addEventListener('input', debounce(async () => {
    if (!isPreviewing) return;
    await updatePreview();
}));

// 预览按钮点击
document.getElementById('preview_btn').addEventListener('click', async () => {
    isPreviewing = !isPreviewing;
    this.textContent = isPreviewing ? '停止预览' : '实时预览';
    if (isPreviewing) await updatePreview();
});

// 更新预览内容
async function updatePreview() {
    const mdText = textarea.value;
    
    const response = await fetch('/preview', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: new URLSearchParams({ markdown_input: mdText })
    });
    
    const html = await response.text();
    previewContent.innerHTML = html;
    
    // 渲染数学公式
    if (window.MathJax) {
        MathJax.typesetPromise().then(addCopyButtons);
    } else {
        addCopyButtons();
    }
}

// 点击“导出 DOCX”按钮：/export?type=docx
document.getElementById('export_docx_btn').addEventListener('click', function() {
    exportFile('docx');
});

// 点击“导出 PDF”按钮：/export?type=pdf
document.getElementById('export_pdf_btn').addEventListener('click', function() {
    exportFile('pdf');
});

// 前端导出图片功能
document.getElementById('export_image_btn').addEventListener('click', async () => {
    // 等待数学公式渲染完成
    if (window.MathJax) {
        await MathJax.typesetPromise();
    }

    // 使用 html2canvas 截图
    html2canvas(previewContent, {
        scale: 2, // 提高截图质量
        useCORS: true, // 允许跨域资源
        logging: true,
        backgroundColor: '#ffffff'
    }).then(canvas => {
        const link = document.createElement('a');
        link.download = 'preview-screenshot.png';
        link.href = canvas.toDataURL('image/png');
        link.click();
    });
});

// 通用的导出函数
function exportFile(fileType) {
    const mdText = document.getElementById('markdown_input').value;
    let formData = new FormData();
    formData.append('markdown_input', mdText);

    fetch(`/export?type=${fileType}`, {
        method: 'POST',
        body: formData
    })
    .then(response => {
        if (!response.ok) {
            throw new Error("导出出现错误: " + response.statusText);
        }
        return response.blob();
    })
    .then(blob => {
        // 前端创建一个下载链接
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `output.${getExtension(fileType)}`;
        document.body.appendChild(a);
        a.click();
        a.remove();
    })
    .catch(err => console.error(err));
}

function getExtension(fileType) {
    if (fileType === 'docx') return 'docx';
    if (fileType === 'pdf') return 'pdf';
    if (fileType === 'image') return 'png';
    return 'dat';
}

// 改进的复制按钮功能
function addCopyButtons() {
    const codeBlocks = document.querySelectorAll('pre code');
    
    codeBlocks.forEach(block => {
        if (block.previousElementSibling?.classList.contains('copy-btn')) return;
        
        const btn = document.createElement('button');
        btn.className = 'copy-btn';
        btn.innerHTML = '复制';
        
        btn.addEventListener('click', async () => {
            try {
                await navigator.clipboard.writeText(block.textContent);
                btn.innerHTML = '✓ 已复制';
                setTimeout(() => btn.innerHTML = '复制', 2000);
            } catch (err) {
                btn.innerHTML = '✗ 失败';
                setTimeout(() => btn.innerHTML = '复制', 2000);
            }
        });
        
        block.parentElement.prepend(btn);
    });
}