// main.js
let turnstileWidgetId = null;
let currentTurnstileToken = null;
let isVerificationInProgress = false;

function showErrorPopup(message) {
    const errorPopup = document.getElementById('error_popup');
    const errorMessage = document.getElementById('error_message');
    errorMessage.textContent = message;
    errorPopup.style.display = 'block';

    setTimeout(() => {
        errorPopup.style.display = 'none';
    }, 5000);
}

// 关闭按钮事件
document.getElementById('error_close_btn').addEventListener('click', () => {
    document.getElementById('error_popup').style.display = 'none';
});

// 显示加载动画
function showLoading() {
    document.getElementById('loading_overlay').classList.add('active');
}

// 隐藏加载动画
function hideLoading() {
    document.getElementById('loading_overlay').classList.remove('active');
}

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

document.addEventListener('DOMContentLoaded', function() {
    setTimeout(initializeTurnstile, 1000);
    
    const storedState = localStorage.getItem('friendLinksExpanded');
    const isFirstVisit = localStorage.getItem('firstVisit') === null;

    if (isFirstVisit) {
        const friendLinks = document.querySelector('.friend-links');
        if (friendLinks) {
            friendLinks.classList.add('active');
            localStorage.setItem('friendLinksExpanded', 'true');
            localStorage.setItem('firstVisit', 'false');
        }
    } else {
        const friendLinks = document.querySelector('.friend-links');
        if (friendLinks && storedState === 'true') {
            friendLinks.classList.add('active');
        }
    }
});

function initializeTurnstile() {
    if (typeof turnstile === 'undefined') {
        console.error('Turnstile 未加载，将重试');
        setTimeout(initializeTurnstile, 1000);
        return;
    }
    
    try {
        turnstileWidgetId = turnstile.render('#turnstile_widget', {
            sitekey: '0x4AAAAAAB8aTjutzLO03ccd',
            callback: function(token) {
                currentTurnstileToken = token;
                onVerificationSuccess();
            },
            'error-callback': function(error) {
                onVerificationError();
            },
            'expired-callback': function() {
                currentTurnstileToken = null;
                if (isVerificationInProgress) {
                    updateVerificationStatus('验证已过期，请重新验证', 'waiting');
                }
            },
            'timeout-callback': function() {
                onVerificationError();
            }
        });
    } catch (error) {
        console.error('✗ Turnstile 初始化失败:', error);
    }
}

// 显示验证蒙版
function showVerificationOverlay() {
    const overlay = document.getElementById('verification_overlay');
    overlay.classList.add('active');
    isVerificationInProgress = true;
    currentTurnstileToken = null;
    
    const widget = document.getElementById('turnstile_widget');
    const displayArea = document.getElementById('turnstile_display_area');
    
    if (widget && displayArea) {
        displayArea.appendChild(widget);
        console.log('  - Turnstile组件已移动到显示区域');
    }
    
    // 重置 Turnstile
    if (turnstileWidgetId !== null) {
        try {
            turnstile.reset(turnstileWidgetId);
            updateVerificationStatus('请完成下方验证', 'waiting');
        } catch (error) {
            updateVerificationStatus('验证组件加载失败，请刷新页面重试', 'error');
        }
    } else {
        console.error('  - turnstileWidgetId 为 null');
        updateVerificationStatus('验证组件未初始化，请刷新页面', 'error');
    }
}

// 隐藏验证蒙版
function hideVerificationOverlay() {
    const overlay = document.getElementById('verification_overlay');
    overlay.classList.remove('active');
    isVerificationInProgress = false;
    
    // 将 Turnstile 组件移回隐藏容器
    const widget = document.getElementById('turnstile_widget');
    const container = document.getElementById('turnstile_container');
    
    if (widget && container) {
        container.appendChild(widget);
    }
}

// 更新验证状态显示
function updateVerificationStatus(message, type = 'waiting') {
    const statusDiv = document.getElementById('verification_status');
    const statusText = statusDiv.querySelector('.status-text');
    
    if (statusText) {
        statusText.textContent = message;
    }
    
    // 移除所有状态类
    statusDiv.classList.remove('success', 'error', 'waiting');
    // 添加新状态类
    statusDiv.classList.add(type);
}

// 验证成功回调
function onVerificationSuccess() {
    updateVerificationStatus('✓ 验证成功！正在处理...', 'success');
    
    setTimeout(() => {
        executeDocxExport();
    }, 800);
}

// 验证失败回调
function onVerificationError() {
    updateVerificationStatus('✗ 验证失败，请重试', 'error');
    currentTurnstileToken = null;
    
    // 3秒后允许重新验证
    setTimeout(() => {
        if (isVerificationInProgress) {
            updateVerificationStatus('请完成下方验证', 'waiting');
            if (turnstileWidgetId !== null) {
                try {
                    turnstile.reset(turnstileWidgetId);
                } catch (error) {
                    console.error('重置失败:', error);
                }
            }
        }
    }, 3000);
}

document.getElementById('export_docx_btn').addEventListener('click', function() {
    if (!textarea.value.trim()) {
        showErrorPopup('请先输入Markdown内容');
        return;
    }
    
    // 显示验证蒙版
    showVerificationOverlay();
});

async function executeDocxExport() {
    
    if (!currentTurnstileToken) {
        showErrorPopup('验证token无效，请重新验证');
        hideVerificationOverlay();
        return;
    }
    
    // 关闭验证蒙版
    hideVerificationOverlay();
    
    // 显示加载动画
    showLoading();
    
    try {
        const mdText = textarea.value;
        const formData = new FormData();
        formData.append('markdown_input', mdText);
        formData.append('cf_turnstile_response', currentTurnstileToken);
        
        const response = await fetch('/export?type=docx', {
            method: 'POST',
            body: formData
        });
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ error: response.statusText }));
            throw new Error(errorData.error || "导出出现错误");
        }
        
        const blob = await response.blob();
        
        // 创建下载链接
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `markdown_export_${new Date().getTime()}.docx`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
        
    } catch (err) {
        showErrorPopup('导出失败：' + err.message);
    } finally {
        currentTurnstileToken = null;
        hideLoading();
    }
}

document.getElementById('verification_overlay').addEventListener('click', function(e) {
    if (e.target === this) {
        hideVerificationOverlay();
        currentTurnstileToken = null;
    }
});

document.getElementById('export_pdf_btn').addEventListener('click', async function() {
    if (!textarea.value.trim()) {
        showErrorPopup('请先输入Markdown内容');
        return;
    }
    
    if (!isPreviewing) {
        try {
            showLoading();
            await updatePreview();
            hideLoading();
        } catch (err) {
            hideLoading();
            showErrorPopup('更新预览失败：' + err.message);
            return;
        }
    }
    
    // 触发浏览器打印
    setTimeout(() => {
        window.print();
    }, 500);
});

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

// 点击按钮切换菜单
if (sponsorMainBtn) {
    sponsorMainBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        sponsorBtn.classList.toggle('active');
        
        // 关闭友情链接菜单
        const friendLinks = document.querySelector('.friend-links');
        if (friendLinks && friendLinks.classList.contains('active')) {
            friendLinks.classList.remove('active');
        }
    });
}

// 友情链接下拉菜单
const friendLinks = document.querySelector('.friend-links');
const friendLinksBtn = document.querySelector('.friend-links-btn');

if (friendLinksBtn) {
    friendLinksBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        friendLinks.classList.toggle('active');
        
        // 关闭支持开发者菜单
        if (sponsorBtn && sponsorBtn.classList.contains('active')) {
            sponsorBtn.classList.remove('active');
        }
    });
}

// 点击外部关闭所有菜单
document.addEventListener('click', (e) => {
    if (sponsorBtn && !sponsorBtn.contains(e.target)) {
        sponsorBtn.classList.remove('active');
    }
    if (friendLinks && !friendLinks.contains(e.target)) {
        friendLinks.classList.remove('active');
    }
});

// 菜单项点击处理
document.querySelectorAll('.menu-item').forEach(item => {
    item.addEventListener('click', () => {
        if (sponsorBtn) sponsorBtn.classList.remove('active');
        if (friendLinks) friendLinks.classList.remove('active');
    });
});