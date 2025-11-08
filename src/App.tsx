import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { VibeKanbanProvider } from '@/components/VibeKanbanProvider';
import Home from '@/pages/Home.tsx';
import './styles/globals.css';

function App() {
  return (
    <Router>
      <VibeKanbanProvider />
      <Routes>
        <Route path="/" element={<Home />} />
      </Routes>
    </Router>
  );
}

export default App;
