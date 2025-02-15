// main.js

// 报错弹窗
function showErrorPopup(message) {
    const errorPopup = document.getElementById('error_popup');
    const errorMessage = document.getElementById('error_message');
    errorMessage.textContent = message;
    errorPopup.style.display = 'block';

    // 自动隐藏（5秒后关闭）
    setTimeout(() => {
        errorPopup.style.display = 'none';
    }, 5000);
}

// 关闭按钮事件
document.getElementById('error_close_btn').addEventListener('click', () => {
    document.getElementById('error_popup').style.display = 'none';
});

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
    try {
        await updatePreview();
    } catch (err) {
        console.error(err);
        showErrorPopup('预览更新错误：' + err.message);
    }
}));

// 预览按钮点击
document.getElementById('preview_btn').addEventListener('click', async () => {
    isPreviewing = !isPreviewing;
    document.getElementById('preview_btn').textContent = isPreviewing ? '停止预览' : '实时预览';
    if (isPreviewing) {
        try {
            await updatePreview();
        } catch (err) {
            console.error(err);
            showErrorPopup('预览更新错误：' + err.message);
        }
    }
});

// 更新预览内容
async function updatePreview() {
    try {
        const mdText = textarea.value;
        
        const response = await fetch('/preview', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: new URLSearchParams({ markdown_input: mdText })
        });
        
        if (!response.ok) {
            throw new Error("预览请求失败: " + response.statusText);
        }
        
        const html = await response.text();
        previewContent.innerHTML = html;
        
        // 渲染数学公式
        if (window.MathJax) {
            MathJax.typesetPromise().then(addCopyButtons);
        } else {
            addCopyButtons();
        }
    } catch (err) {
        console.error(err);
        showErrorPopup('更新预览时出错：' + err.message);
    }
}

// 点击"导出 DOCX"按钮：/export?type=docx
document.getElementById('export_docx_btn').addEventListener('click', function() {
    exportFile('docx');
});

// 点击"导出 PDF"按钮：/export?type=pdf
document.getElementById('export_pdf_btn').addEventListener('click', function() {
    exportFile('pdf');
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
    .catch(err => {
        console.error(err);
        showErrorPopup('导出文件失败：' + err.message);
    });
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
                showErrorPopup('复制代码失败：' + err.message);
            }
        });
        
        block.parentElement.prepend(btn);
    });
}

// 支持开发者下拉菜单
const sponsorBtn = document.querySelector('.sponsor-btn');
const sponsorMainBtn = document.querySelector('.sponsor-main-btn');
const sponsorMenu = document.querySelector('.sponsor-btn .dropdown-menu');

// 点击按钮切换菜单
sponsorMainBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    sponsorBtn.classList.toggle('active');
    
    // 关闭友情链接菜单
    const friendLinks = document.querySelector('.friend-links');
    if (friendLinks.classList.contains('active')) {
        friendLinks.classList.remove('active');
    }
});

// 友情链接下拉菜单
const friendLinks = document.querySelector('.friend-links');
const friendLinksBtn = document.querySelector('.friend-links-btn');

friendLinksBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    friendLinks.classList.toggle('active');
    
    // 关闭支持开发者菜单
    if (sponsorBtn.classList.contains('active')) {
        sponsorBtn.classList.remove('active');
    }
});

// 点击外部关闭所有菜单
document.addEventListener('click', (e) => {
    if (!sponsorBtn.contains(e.target)) {
        sponsorBtn.classList.remove('active');
    }
    if (!friendLinks.contains(e.target)) {
        friendLinks.classList.remove('active');
    }
});

// 菜单项点击处理
document.querySelectorAll('.menu-item').forEach(item => {
    item.addEventListener('click', () => {
        sponsorBtn.classList.remove('active');
        friendLinks.classList.remove('active');
    });
});

// 初始化友情链接状态
document.addEventListener('DOMContentLoaded', () => {
    const storedState = localStorage.getItem('friendLinksExpanded');
    const isFirstVisit = localStorage.getItem('firstVisit') === null;

    // 首次访问自动展开
    if (isFirstVisit) {
        friendLinks.classList.add('active');
        localStorage.setItem('friendLinksExpanded', 'true');
        localStorage.setItem('firstVisit', 'false');
    } else {
        if (storedState === 'true') friendLinks.classList.add('active');
    }
});