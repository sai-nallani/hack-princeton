import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { VibeKanbanProvider } from '@/components/VibeKanbanProvider';
import Home from '@/pages/Home';
import About from '@/pages/About';
import './styles/globals.css';

function App() {
  return (
    <Router>
      <VibeKanbanProvider />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/about" element={<About />} />
      </Routes>
    </Router>
  );
}

export default App;
