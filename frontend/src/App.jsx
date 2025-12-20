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
          {/* Analytics Dashboard - default view */}
          <Route path="/" element={<Navigate to="/analytics" replace />} />
          <Route path="/analytics" element={<MacroOverview view="analytics" />} />
          {/* Value Parity Tool - buyer decision tool */}
          <Route path="/value-parity" element={<MacroOverview view="value-parity" />} />
          {/* Redirect old routes */}
          <Route path="/dashboard" element={<Navigate to="/analytics" replace />} />
          <Route path="/macro-overview" element={<Navigate to="/analytics" replace />} />
          <Route path="*" element={<Navigate to="/analytics" replace />} />
        </Routes>
      </BrowserRouter>
    </DataProvider>
  );
}

export default App;
