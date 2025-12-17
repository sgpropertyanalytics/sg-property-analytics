import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
} from 'chart.js';
import { Line } from 'react-chartjs-2';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
);

function RegionChart({ data, valueFormatter, title, isPSF = false }) {
  if (!data || data.length === 0) {
    return <div>No data available</div>;
  }

  const labels = data.map(d => d.quarter || '');
  
  // Convert null/undefined to NaN for Chart.js to properly show gaps
  const ccrData = data.map(d => {
    const val = d.ccr;
    return (val == null || val === undefined) ? NaN : val;
  });
  const rcrData = data.map(d => {
    const val = d.rcr;
    return (val == null || val === undefined) ? NaN : val;
  });
  const ocrData = data.map(d => {
    const val = d.ocr;
    return (val == null || val === undefined) ? NaN : val;
  });

  const OCEAN_BLUE = '#0ea5e9';
  const datasets = [
    {
      label: 'CCR',
      data: ccrData,
      borderColor: OCEAN_BLUE,
      backgroundColor: OCEAN_BLUE + '20',
      tension: 0.4,
      spanGaps: false,
      pointRadius: 4,
      pointHoverRadius: 6,
      pointHitRadius: 10,
      fill: false
    },
    {
      label: 'RCR',
      data: rcrData,
      borderColor: OCEAN_BLUE,
      backgroundColor: OCEAN_BLUE + '20',
      tension: 0.4,
      spanGaps: false,
      pointRadius: 4,
      pointHoverRadius: 6,
      pointHitRadius: 10,
      fill: false
    },
    {
      label: 'OCR',
      data: ocrData,
      borderColor: '#0284c7', // Darker blue variant
      backgroundColor: '#0284c720',
      tension: 0.4,
      spanGaps: false,
      pointRadius: 4,
      pointHoverRadius: 6,
      pointHitRadius: 10,
      fill: false
    }
  ];

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      intersect: false,
      mode: 'index'
    },
    plugins: {
      legend: { display: true, position: 'top' },
      tooltip: {
        callbacks: {
          label: function(context) {
            const value = context.parsed.y;
            if (value == null || isNaN(value)) {
              return context.dataset.label + ': No data';
            }
            return context.dataset.label + ': ' + (valueFormatter ? valueFormatter(value) : value);
          }
        }
      }
    },
    scales: {
      y: {
        beginAtZero: false,
        ticks: {
          callback: function(value) {
            if (isNaN(value)) return '';
            return valueFormatter ? valueFormatter(value) : value;
          }
        }
      },
      x: {
        ticks: {
          maxRotation: 45,
          minRotation: 45,
          autoSkip: false
        }
      }
    }
  };

  return (
    <div>
      <h3 style={{ fontSize: '14px', color: '#6B7280', marginBottom: '12px' }}>
        {title}
      </h3>
      <div style={{ height: '300px', position: 'relative' }}>
        <Line data={{ labels, datasets }} options={options} />
      </div>
    </div>
  );
}

export default RegionChart;

