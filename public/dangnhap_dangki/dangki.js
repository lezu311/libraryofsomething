const registerForm = document.getElementById('register-form');
const messageBox = document.getElementById('register-message');

function setMessage(text, isSuccess = false) {
    messageBox.textContent = text;
    messageBox.classList.toggle('success', isSuccess);
}

document.querySelectorAll('.toggle-password').forEach(btn => {
    btn.addEventListener('click', () => {
        const input = document.getElementById(btn.dataset.target);
        const isHidden = input.type === 'password';
        input.type = isHidden ? 'text' : 'password';
        btn.textContent = isHidden ? 'Ẩn' : 'Hiện';
    });
});

registerForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    setMessage('');

    const fullname = document.getElementById('reg-fullname').value.trim();
    const username = document.getElementById('reg-username').value.trim();
    const password = document.getElementById('reg-password').value;
    const password2 = document.getElementById('reg-password2').value;

    if (!fullname || !username || !password || !password2) {
        setMessage('Vui lòng điền đầy đủ các ô.');
        return;
    }
    if (username.length < 4) {
        setMessage('Tên đăng nhập phải có ít nhất 4 ký tự.');
        return;
    }
    if (password.length < 6) {
        setMessage('Mật khẩu phải có ít nhất 6 ký tự.');
        return;
    }
    if (password !== password2) {
        setMessage('Hai mật khẩu không khớp.');
        return;
    }

    const btn = registerForm.querySelector('.submit-button');
    btn.disabled = true;
    btn.textContent = 'Đang tạo tài khoản...';

    try {
        const response = await fetch('/api/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fullname, username, password })
        });
        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
            setMessage(data.message || 'Không tạo được tài khoản. Tên đăng nhập có thể đã tồn tại.');
            return;
        }

        setMessage('Đăng ký thành công! Đang chuyển sang trang đăng nhập...', true);
        setTimeout(() => { window.location.href = 'login.html'; }, 1500);
    } catch (err) {
        setMessage('Không kết nối được tới máy chủ. Hãy thử lại sau.');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Tạo tài khoản';
    }
});