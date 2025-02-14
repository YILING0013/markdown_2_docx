// 点击“预览”按钮：发起 /preview 请求
document.getElementById('preview_btn').addEventListener('click', function() {
    const mdText = document.getElementById('markdown_input').value;

    fetch('/preview', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: new URLSearchParams({
            'markdown_input': mdText
        })
    })
    .then(response => response.text())
    .then(html => {
        // 将后端返回的 HTML 放到预览区域
        document.getElementById('preview_area').innerHTML = html;
    })
    .catch(err => console.error(err));
});

// 点击“导出 DOCX”按钮：/export?type=docx
document.getElementById('export_docx_btn').addEventListener('click', function() {
    exportFile('docx');
});

// 点击“导出 PDF”按钮：/export?type=pdf
document.getElementById('export_pdf_btn').addEventListener('click', function() {
    exportFile('pdf');
});

// 点击“导出 PNG”按钮：/export?type=image
document.getElementById('export_image_btn').addEventListener('click', function() {
    exportFile('image');
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
