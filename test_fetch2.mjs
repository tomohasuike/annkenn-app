const url = "https://drive.google.com/uc?id=1NhrtSsvqLIa9dzbm-jbOZRQU29eDpqcU&export=download";
fetch(url).then(async res => {
    console.log("Status:", res.status);
    console.log("Headers:", [...res.headers.entries()]);
    const text = await res.text();
    console.log("Output start:", text.substring(0, 100));
}).catch(e => console.error(e));
