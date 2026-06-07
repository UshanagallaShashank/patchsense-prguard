import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ReviewsPage } from "./pages/reviews-page";

// Root app component — defines all client-side routes
export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<ReviewsPage />} />
      </Routes>
    </BrowserRouter>
  );
}
