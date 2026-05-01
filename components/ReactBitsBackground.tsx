"use client";

export default function ReactBitsBackground(): JSX.Element {
  return (
    <>
      <style>{`
        @keyframes pulse-opacity {
          0%, 100% { opacity: 0.3; }
          50% { opacity: 0.8; }
        }
      `}</style>
      <div
        className="fixed inset-0 -z-10 overflow-hidden pointer-events-none"
        style={{
          background: "linear-gradient(180deg, #120f17 0%, #0e0b13 100%)",
          animation: "pulse-opacity 3s ease-in-out infinite",
        }}
      >
        {/* Purple glow layer 1 */}
        <div
          style={{
            position: "absolute",
            width: "600px",
            height: "600px",
            background: "radial-gradient(circle, rgba(168, 85, 247, 0.6) 0%, transparent 70%)",
            top: "-100px",
            left: "-100px",
            filter: "blur(60px)",
            animation: "pulse-opacity 4s ease-in-out infinite reverse",
          }}
        />

        {/* Purple glow layer 2 */}
        <div
          style={{
            position: "absolute",
            width: "500px",
            height: "500px",
            background: "radial-gradient(circle, rgba(217, 70, 239, 0.5) 0%, transparent 70%)",
            bottom: "0",
            right: "-50px",
            filter: "blur(80px)",
            animation: "pulse-opacity 5s ease-in-out infinite",
          }}
        />
      </div>
    </>
  );
}
