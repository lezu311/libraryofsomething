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

        // nút Thông báo (kèm số thông báo đang chờ xử lý)
        const notify = document.createElement('a');
        notify.className = 'login-link';
        notify.href = 'nhansach/nhansach.html';
        notify.textContent = 'Thông báo';
        if (me.pendingRequests > 0) {
            const badge = document.createElement('span');
            badge.className = 'request-badge';
            badge.textContent = me.pendingRequests;
            notify.appendChild(badge);
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
        box.append(notify, out);
    })
    .catch(() => {});