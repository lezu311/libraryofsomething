const ctx = document.getElementById("chart");

async function getData() {
    const response = await fetch("/api/stats");

    if (!response.ok) {
        console.log("Request failed:", response.status);
        return;
    }

    const data = await response.json();

    // rows -> separate lists
    const labels = data.map(row => row.day);
    const shared = data.map(row => row.shared);
    const given  = data.map(row => row.given);

    new Chart(ctx, {
        type: "line",
        data: {
            labels: labels,
            datasets: [
                {
                    label: "số sách đã đăng",
                    data: shared,
                    borderColor: "blue",
                    backgroundColor: "lightblue",
                    borderWidth: 3,
                    tension: 0
                },
                {
                    label: "số sách đã nhận",
                    data: given,
                    borderColor: "green",
                    backgroundColor: "lightgreen",
                    borderWidth: 3,
                    tension: 0
                }
            ]
        },
        options: {
            responsive: true,
            plugins: {
                legend: { display: true, position: "bottom" }
            },
            scales: {
                y: { beginAtZero: true }
            }
        }
    });
}

getData();