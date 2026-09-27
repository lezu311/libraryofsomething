document.querySelectorAll('.category-button').forEach(button => {
    button.addEventListener('click', () => {
        document.querySelectorAll('.category-button').forEach(btn => {
            btn.classList.remove('selected');
        })

        button.classList.add('selected');
    });
});