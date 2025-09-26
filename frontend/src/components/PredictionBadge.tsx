import { useEffect, useState } from "react";

interface Prediction {
  symbol: string;
  prediction: "UP" | "DOWN";
  confidence: number;
}

export function PredictionBadge({ symbol }: { symbol: string }) {
  const [prediction, setPrediction] = useState<Prediction | null>(null);

  useEffect(() => {
    const fetchPrediction = async () => {
      try {
        const res = await fetch(`http://localhost:8000/predict/${symbol}`);
        const data = await res.json();
        if (!data.error) setPrediction(data);
      } catch (err) {
        console.error("Failed to fetch prediction:", err);
      }
    };

    // Fetch immediately
    fetchPrediction();

    // Then every 5 minutes
    const interval = setInterval(fetchPrediction, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [symbol]);

  if (!prediction) return <div>Loading prediction...</div>;

  const color = prediction.prediction === "UP" ? "#00AA76" : "#D60A22";

  return (
    <div
      style={{
        padding: "8px 12px",
        backgroundColor: "#222",
        color,
        border: `1px solid ${color}`,
        borderRadius: "4px",
        fontWeight: "bold",
        marginBottom: "12px",
        display: "inline-block",
      }}
    >
      {/* Updated title */}
      Next 5-Minute Price Direction Prediction: {prediction.prediction} (
      {(prediction.confidence * 100).toFixed(0)}%)
      {/* Explanatory sentence */}
      <div
        style={{
          fontWeight: "normal",
          fontSize: "0.85em",
          marginTop: "4px",
          color: "#ccc",
        }}
      >
        This indicates the likelihood that the stock price will close higher or
        lower in the next 5-minute interval.
      </div>
    </div>
  );
}
