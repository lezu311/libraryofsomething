document.querySelectorAll('.category-button').forEach(button => {
    button.addEventListener('click', () => {
        document.querySelectorAll('.category-button').forEach(btn => {
            btn.classList.remove('selected');
        })

        button.classList.add('selected');
    });
});

document.querySelectorAll('summary .category-button').forEach(button => {
    button.addEventListener('click', () => {
        const details = button.closest('details');
        details.open = !details.open;
    });
});

const booksByCategory = {
    'test-1': ['Toán', 'Sách A2', 'Sách A3'],
    'test-2': ['Sách B1', 'Sách B2'],
    't-1': ['Sách C1'],
    't-2': ['Sách D1', 'Sách D2', 'Sách D3', 'Sách D4']
};

const resultsBox = document.querySelector('.search-results');

function showResults(categoryId) {
    const titles = booksByCategory[categoryId] || [];
    resultsBox.innerHTML = '';

    if (titles.length === 0) {
        resultsBox.textContent = 'Chưa có sách nào trong mục này.';
        return;
    }

    titles.forEach(title => {
        const card = document.createElement('div');
        card.className = 'search-result';

        const cover = document.createElement('div');
        cover.className = 'cover-placeholder';

        const name = document.createElement('p');
        name.className = 'title';
        name.textContent = title;

        card.append(cover, name);
        resultsBox.appendChild(card);
    });
}

document.querySelectorAll('.leaf .category-button').forEach(button => {
    button.addEventListener('click', () => showResults(button.dataset.category));
});

const root = document.documentElement;
const themeBtn = document.getElementById("themeToggle");

function currentTheme() {
    return root.dataset.theme ||
        (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
}

function applyTheme(theme) {
    root.dataset.theme = theme;
    themeBtn.textContent = theme === "dark" ? "Sáng" : "Tối";
    try { localStorage.setItem("theme", theme); } catch (e) {}
}

themeBtn.textContent = currentTheme() === "dark" ? "Sáng" : "Tối";

themeBtn.addEventListener("click", () => {
    applyTheme(currentTheme() === "dark" ? "light" : "dark");
});