const form = document.querySelector("#upload-form");
const message = document.querySelector("#form-message");
const coverInput = document.querySelector("#cover");
const coverPreview = document.querySelector("#cover-preview");
const submitButton = form.querySelector(".submit-button");

// show the chosen image before uploading
coverInput.addEventListener("change", () => {
    const file = coverInput.files[0];

    if (!file) {
        coverPreview.hidden = true;
        return;
    }

    coverPreview.src = URL.createObjectURL(file);
    coverPreview.hidden = false;
});

function showMessage(text, isError) {
    message.textContent = text;
    message.classList.toggle("error", isError);
}

form.addEventListener("submit", async (event) => {
    event.preventDefault();

    // quick check in the browser (the server checks again)
    const file = coverInput.files[0];
    if (file && file.size > 1024 * 1024) {
        showMessage("Cover is too big (max 1 MB)", true);
        return;
    }

    submitButton.disabled = true;
    showMessage("Saving...", false);

    try {
        // no Content-Type header here: the browser sets it for files
        const res = await fetch("/api/books", {
            method: "POST",
            body: new FormData(form)
        });

        const data = await res.json();

        if (!res.ok) {
            showMessage(data.error || "Something went wrong", true);
            submitButton.disabled = false;
            return;
        }

        window.location.href = "/bookview/view.html?id=" + data.id;
    } catch (err) {
        showMessage("Could not reach the server", true);
        submitButton.disabled = false;
    }
});
