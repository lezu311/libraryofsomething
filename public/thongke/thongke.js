const ctx = document.getElementById("chart")

new Chart(ctx, {
    type : "line",
    data : {
        labels : ["1", "2", "3", "4", "5"],
        datasets : [
            {
                label : "books shared",
                data : [10, 20, 30, 25, 40],
                borderColor : "blue",
                backgroundColor : "lightblue",
                borderWidth : 3,
                tension : 0
            },
            {
                label : "books sent",
                data : [5, 15, 35, 20, 30],
                borderColor : "green",
                backgroundColor : "lightgreen",
                borderWidth : 3,
                tension : 0
            }
        ]
    },
    options : {
        responsive : true,
        plugins : {
            legend : {
                display : true,
                position : "bottom"
            }
        },
        scales : {
            y : {
                beginAtZero : true
            }
        }
    }
})

async function getExpressData() {
    const response = await fetch(`api/stats`, {
        method : 'POST'
    });

    if (response.ok)
    {
        const data = await response.json();

        console.log('Data received:', data);
        return data;
    }
}