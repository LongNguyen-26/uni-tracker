"use client";
/**
 * The conventions of the day grid, drawn rather than described. Every sample is
 * a real cell in the real styles, so reading the key is reading the grid.
 */
const KEY: { sample: React.ReactNode; label: string }[] = [
  {
    sample: <span className="key-cell today" />,
    label: "Hôm nay",
  },
  {
    sample: (
      <span className="key-cell" style={{ background: "#7c3aed" }}>
        <i className="deadline-corner" style={{ background: "#b45309" }} />
      </span>
    ),
    label: "Dấu góc: hạn đã chốt của một mục tiêu",
  },
  {
    sample: (
      <span
        className="key-cell"
        style={{
          background: "linear-gradient(135deg, #7c3aed 0% 50%, #ea580c 50%)",
        }}
      />
    ),
    label: "Màu mục tiêu, đậm dần theo số giờ đã ghi trong ngày",
  },
  {
    sample: <span className="key-cell planned" />,
    label: "Viền đứt: phiên bạn đã dự định nhưng chưa ghi giờ",
  },
  {
    sample: (
      <span className="key-cell">
        <i className="milestone-corner" style={{ background: "#c2410c" }} />
      </span>
    ),
    label: "Góc đặc: cột mốc giữa chặng",
  },
  {
    sample: <span className="key-cell glyph">★</span>,
    label: "Cột mốc đã đạt",
  },
  {
    sample: <span className="key-cell glyph">G</span>,
    label: "Thi giữa kỳ (C là thi cuối kỳ)",
  },
  {
    sample: <span className="key-cell band" />,
    label: "Nền dải tuần: khoảng sự kiện; viền đứt khi ngày chưa chốt",
  },
];
export default function HeatmapKey() {
  return (
    <dl className="heatmap-key">
      {KEY.map((row) => (
        <div key={row.label}>
          <dt aria-hidden="true">{row.sample}</dt>
          <dd>{row.label}</dd>
        </div>
      ))}
    </dl>
  );
}
