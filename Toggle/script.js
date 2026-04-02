const toggle = document.getElementById("toggle");
let isAnimating = false;

const startAnimation = () => {
  if (isAnimating) return;
  isAnimating = true;
  toggle.classList.add("animate");
};

const resetAnimation = () => {
  toggle.classList.remove("animate");
  isAnimating = false;
};

toggle.addEventListener("click", startAnimation);
toggle.addEventListener("animationend", resetAnimation);
