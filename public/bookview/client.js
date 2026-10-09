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