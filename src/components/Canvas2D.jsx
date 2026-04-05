import { useEffect, useRef } from "react";

function Canvas2D({ rooms }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");

    const scale = 50; // 1 unit = 50px

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    (rooms || []).forEach(room => {
      const x = room.x * scale;
      const y = room.y * scale;
      const w = room.width * scale;
      const h = room.height * scale;

      // Room color
      const colors = {
        bedroom: "#ADD8E6",
        kitchen: "#FFD580",
        hall: "#90EE90",
        bathroom: "#FF9999"
      };

      ctx.fillStyle = colors[room.type] || "#ddd";
      ctx.fillRect(x, y, w, h);

      ctx.strokeStyle = "#333";
      ctx.lineWidth = 2;
      ctx.strokeRect(x, y, w, h);

      ctx.fillStyle = "#000";
      ctx.font = "bold 12px sans-serif";
      ctx.fillText(room.type.toUpperCase(), x + 8, y + 20);
      ctx.font = "10px sans-serif";
      ctx.fillText(`${room.width}m x ${room.height}m`, x + 8, y + 35);
    });

  }, [rooms]);

  return (
    <div className="canvas-2d-container" style={{ 
      border: '1px solid var(--border)', 
      borderRadius: '8px', 
      overflow: 'hidden',
      background: '#fff',
      boxShadow: 'var(--shadow-lg)'
    }}>
      <canvas 
        ref={canvasRef} 
        width={800} 
        height={600} 
        style={{ display: 'block', width: '100%', height: 'auto' }}
      />
    </div>
  );
}

export default Canvas2D;
