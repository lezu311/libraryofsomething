document.querySelectorAll('summary .category-button').forEach(button => {
    button.addEventListener('click', () => {
        const details = button.closest('details');
        details.open = !details.open;
    });
});
document.querySelectorAll('.leaf .category-button').forEach(button => {
    button.addEventListener('click', () => {
        const category = button.dataset.category;

        document.querySelectorAll('.leaf .category-button').forEach(btn => {
            btn.classList.remove('selected');
        });

        if (currentCategory === category) {
            currentCategory = "";
        } else {
            currentCategory = category;
            button.classList.add('selected');
        }

        search(searchBar.value);
    });
});