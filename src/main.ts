import "./style.css";

const app: HTMLDivElement = document.querySelector("#app")!;

document.title = "GeoCache Moment";

const button = document.createElement("button");
button.innerHTML = "click me!";
app.append(button);
button.addEventListener("click", () => {
  alert("thanks for doing that");
});
//checking for workflow run
