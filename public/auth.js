fetch('/api/me')
    .then(res => (res.ok ? res.json() : null))
    .then(me => {
        if (!me) return;

        const box = document.querySelector('.header-actions');
        box.replaceChildren();

        const hello = document.createElement('span');
        hello.textContent = 'Xin chào, ' + me.fullname;
        hello.style.marginRight = '12px';

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