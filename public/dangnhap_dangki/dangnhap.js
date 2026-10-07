const loginForm = document.getElementById('login-form');
const messageBox = document.getElementById('login-message');

function setMessage(text) {
    messageBox.textContent = text;
}

// Hiện / ẩn mật khẩu
document.querySelectorAll('.toggle-password').forEach(btn => {
    btn.addEventListener('click', () => {
        const input = document.getElementById(btn.dataset.target);
        const isHidden = input.type === 'password';
        input.type = isHidden ? 'text' : 'password';
        btn.textContent = isHidden ? 'Ẩn' : 'Hiện';
    });
});

loginForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    setMessage('');

    const username = document.getElementById('login-username').value.trim();
    const password = document.getElementById('login-password').value;

    if (!username || !password) {
        setMessage('Vui lòng nhập đầy đủ tên đăng nhập và mật khẩu.');
        return;
    }

    const btn = loginForm.querySelector('.submit-button');
    btn.disabled = true;
    btn.textContent = 'Đang đăng nhập...';

    try {
        // Cần server.js có route POST /api/login
        const response = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
            setMessage(data.message || 'Sai tên đăng nhập hoặc mật khẩu.');
            return;
        }
        window.location.href = 'index.html';
    } catch (err) {
        setMessage('Không kết nối được tới máy chủ. Hãy thử lại sau.');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Đăng nhập';
    }
});