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
    'test-1': [
        { id: 'a1', title: 'Toán' },
        { id: 'a2', title: 'Sách A2' },
        { id: 'a3', title: 'Sách A3' }
    ],
    'test-2': [
        { id: 'b1', title: 'Sách B1' },
        { id: 'b2', title: 'Sách B2' }
    ],
    't-1': [
        { id: 'c1', title: 'Sách C1' }
    ],
    't-2': [
        { id: 'd1', title: 'Sách D1' },
        { id: 'd2', title: 'Sách D2' },
        { id: 'd3', title: 'Sách D3' },
        { id: 'd4', title: 'Sách D4' }
    ]
};

const resultsBox = document.querySelector('.search-results');

function showResults(categoryId) {
    const books = booksByCategory[categoryId] || [];
    resultsBox.innerHTML = '';

    if (books.length === 0) {
        resultsBox.textContent = 'Chưa có sách nào trong mục này.';
        return;
    }

    books.forEach(book => {
        const card = document.createElement('div');
        card.className = 'search-result';

        const cover = document.createElement('div');
        cover.className = 'cover-placeholder';

        const name = document.createElement('p');
        name.className = 'title';
        name.textContent = book.title;

        const viewBtn = document.createElement('a');
        viewBtn.className = 'view-button';
        viewBtn.textContent = 'Xem sách';
        viewBtn.href = `bookview/view.html?id=${encodeURIComponent(book.id)}`;

        card.append(cover, name, viewBtn);
        resultsBox.appendChild(card);
    });
}

document.querySelectorAll('.leaf .category-button').forEach(button => {
    button.addEventListener('click', () => showResults(button.dataset.category));
});