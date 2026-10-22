fetch('/api/me')
    .then(res => (res.ok ? res.json() : null))
    .then(me => {
        if (!me) return; // chưa đăng nhập: nút Đăng sách vẫn ẩn

        const box = document.querySelector('.header-actions');

        // đã đăng nhập: hiện nút Đăng sách
        const uploadLink = box.querySelector('.upload-link');
        if (uploadLink) uploadLink.hidden = false;

        // xóa nút Đăng nhập / Đăng ký
        box.querySelectorAll('a[href^="dangnhap_dangki/"]').forEach(a => a.remove());

        const hello = document.createElement('span');
        hello.textContent = 'Xin chào, ' + me.fullname;
        hello.style.whiteSpace = 'nowrap';

        const out = document.createElement('a');
        out.className = 'login-link';
        out.href = '#';
        out.textContent = 'Đăng xuất';
        out.addEventListener('click', async (e) => {
            e.preventDefault();
            await fetch('/api/logout', { method: 'POST' });
            location.reload();
        });

        box.append(hello, out);
    })
    .catch(() => {});