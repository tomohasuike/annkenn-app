const url = "https://lh3.googleusercontent.com/drive-storage/AJQWtBOtD8Z63omV5n9tEkAL0iYGTRvPaNAHUbedqVI7T4SdEsMVd85SXHMZOsl9Wm-RH-wtnyEy3cF40KPUFMtozoZ0vKbPE7kgeg6qD3Z_Dpl9kPJwrj0=s800";
fetch(url).then(res => {
    console.log("Status:", res.status);
    console.log("Headers:", [...res.headers.entries()]);
}).catch(e => console.error(e));
