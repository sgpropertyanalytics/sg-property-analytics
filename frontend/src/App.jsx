import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { DataProvider } from './context/DataContext';
import { FilterProvider } from './context/FilterContext';
import { Layout } from './components/layout/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import { PriceAnalysis } from './pages/PriceAnalysis';
import { VolumeAnalysis } from './pages/VolumeAnalysis';
import { Projects } from './pages/Projects';
import { Districts } from './pages/Districts';
import { Budget } from './pages/Budget';
import { SaleType } from './pages/SaleType';

function App() {
  return (
    <DataProvider>
      <FilterProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route 
              path="/dashboard" 
              element={
                <Layout>
                  <Dashboard />
                </Layout>
              } 
            />
            <Route 
              path="/price-analysis" 
              element={
                <Layout>
                  <PriceAnalysis />
                </Layout>
              } 
            />
            <Route 
              path="/volume-analysis" 
              element={
                <Layout>
                  <VolumeAnalysis />
                </Layout>
              } 
            />
            <Route 
              path="/projects" 
              element={
                <Layout>
                  <Projects />
                </Layout>
              } 
            />
            <Route 
              path="/districts" 
              element={
                <Layout>
                  <Districts />
                </Layout>
              } 
            />
            <Route 
              path="/budget" 
              element={
                <Layout>
                  <Budget />
                </Layout>
              } 
            />
            <Route 
              path="/sale-type" 
              element={
                <Layout>
                  <SaleType />
                </Layout>
              } 
            />
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </BrowserRouter>
      </FilterProvider>
    </DataProvider>
  );
}

export default App;

