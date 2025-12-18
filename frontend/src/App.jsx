import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { DataProvider } from './context/DataContext';
import Login from './pages/Login';
import MacroOverview from './pages/MacroOverview';

function App() {
  return (
    <DataProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<MacroOverview />} />
          {/* Redirect old routes to home */}
          <Route path="/dashboard" element={<Navigate to="/" replace />} />
          <Route path="/macro-overview" element={<Navigate to="/" replace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </DataProvider>
  );
}

export default App;
