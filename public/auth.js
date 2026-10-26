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

        // thẻ tên: vòng tròn chữ cái đầu + tên
        const chip = document.createElement('div');
        chip.className = 'user-chip';

        const lastWord = me.fullname.trim().split(/\s+/).pop() || '?';
        const avatar = document.createElement('span');
        avatar.className = 'user-avatar';
        avatar.textContent = lastWord.charAt(0).toUpperCase();

        const name = document.createElement('span');
        name.className = 'user-name';
        name.textContent = me.fullname;
        name.title = me.fullname;

        chip.append(avatar, name);

        // nút Yêu cầu (kèm số yêu cầu đang chờ)
        const requests = document.createElement('a');
        requests.className = 'login-link';
        requests.href = 'requests/requests.html';
        requests.textContent = 'Yêu cầu';
        if (me.pendingRequests > 0) {
            const badge = document.createElement('span');
            badge.className = 'request-badge';
            badge.textContent = me.pendingRequests;
            requests.appendChild(badge);
        }

        const out = document.createElement('a');
        out.className = 'login-link';
        out.href = '#';
        out.textContent = 'Đăng xuất';
        out.addEventListener('click', async (e) => {
            e.preventDefault();
            await fetch('/api/logout', { method: 'POST' });
            location.reload();
        });

        box.prepend(chip);
        box.append(requests, out);
    })
    .catch(() => {});