/** Briefly gather the visible cells of an estimated window into its confirmed date. */
export function contractMilestoneWindow(
  goalId: string,
  stepId: string,
  day: string,
) {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const cells = Array.from(
    document.querySelectorAll<HTMLElement>("[data-milestones]"),
  );
  const id = JSON.stringify([goalId, stepId]);
  const old = cells.filter((el) => {
    const keys = JSON.parse(el.dataset.milestones || "[]") as string[];
    return keys.includes(id);
  });
  for (const el of old) {
    const rect = el.getBoundingClientRect();
    if (
      rect.bottom < 0 ||
      rect.top > window.innerHeight ||
      rect.right < 0 ||
      rect.left > window.innerWidth
    )
      continue;
    const target = el
      .closest(".semester-card")
      ?.querySelector<HTMLElement>(`[data-day="${day}"]`);
    const dest = target?.getBoundingClientRect();
    const ghost = document.createElement("div");
    Object.assign(ghost.style, {
      position: "fixed",
      left: `${rect.left}px`,
      top: `${rect.top}px`,
      width: `${rect.width}px`,
      height: `${rect.height}px`,
      background: getComputedStyle(el).background,
      borderRadius: "3px",
      pointerEvents: "none",
      zIndex: "30",
      transformOrigin: "center",
    });
    document.body.append(ghost);
    const animation = ghost.animate(
      [
        { opacity: 0.8, transform: "translate(0,0) scale(1)" },
        {
          opacity: 0,
          transform: dest
            ? `translate(${dest.left - rect.left}px,${dest.top - rect.top}px) scale(.45)`
            : "scale(.2)",
        },
      ],
      { duration: 280, easing: "ease-in-out" },
    );
    animation.finished.then(
      () => ghost.remove(),
      () => ghost.remove(),
    );
  }
}
