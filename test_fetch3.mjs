const url = "https://lh3.googleusercontent.com/d/1NhrtSsvqLIa9dzbm-jbOZRQU29eDpqcU=s800";
fetch(url).then(async res => {
    console.log("Status:", res.status);
    console.log("Headers:", [...res.headers.entries()]);
    console.log("Is output image?:", res.headers.get("content-type"));
}).catch(e => console.error(e));
