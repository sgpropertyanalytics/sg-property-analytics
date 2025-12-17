import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend
} from 'chart.js';
import { Bar } from 'react-chartjs-2';

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend
);

// Slate blue palette – lighter for smaller bedrooms, darker for larger
// 2BR: light slate blue, 3BR: medium, 4BR: deepest navy
const COLORS = {
  '2b': '#4f81bd', // light/medium slate blue
  '3b': '#28527a', // medium-deep slate blue
  '4b': '#112B3C', // darkest navy for largest bedroom type
};

const BEDROOM_LABELS = {
  '2b': '2-Bedroom',
  '3b': '3-Bedroom',
  '4b': '4-Bedroom',
};

function BarChart({ data, selectedBedrooms, valueFormatter, title, horizontal = false, stacked = false, showCountLabels = false, beginAtZero = true }) {
  if (!data || data.length === 0) {
    return <div>No data available</div>;
  }

  const labels = data.map(d => d.month || d.quarter || d.district || '');
  
  const datasets = selectedBedrooms.map(bedroom => {
    const countKey = `${bedroom}_count`;
    const valueKey = `${bedroom}_total` || `${bedroom}_value`;
    
    const chartData = data.map(d => {
      // For transaction count charts, use count
      if (countKey in d) {
        return d[countKey] || 0;
      }
      // For other charts, use value
      return d[valueKey] || 0;
    });

    return {
      label: BEDROOM_LABELS[bedroom] || bedroom,
      data: chartData,
      backgroundColor: COLORS[bedroom] || '#6B7280',
      borderColor: COLORS[bedroom] || '#6B7280',
      borderWidth: 1,
    };
  });

  const options = {
    indexAxis: horizontal ? 'y' : 'x',
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      intersect: false,
      mode: 'index'
    },
    plugins: {
      legend: {
        display: true,
        position: 'top'
      },
      tooltip: {
        callbacks: {
          label: function(context) {
            const value = context.parsed[horizontal ? 'x' : 'y'];
            const label = context.dataset.label + ': ' + (valueFormatter ? valueFormatter(value) : value.toLocaleString());
            return label;
          }
        }
      }
    },
    scales: {
      x: {
        beginAtZero: beginAtZero,
        stacked: stacked,
        ticks: {
          callback: function(value) {
            return valueFormatter ? valueFormatter(value) : value.toLocaleString();
          }
        }
      },
      y: {
        beginAtZero: beginAtZero,
        stacked: stacked,
        ticks: {
          callback: function(value) {
            return valueFormatter ? valueFormatter(value) : value.toLocaleString();
          }
        }
      }
    }
  };

  return (
    <div>
      {title && <h3 style={{ fontSize: '14px', color: '#6B7280', marginBottom: '12px' }}>{title}</h3>}
      <div style={{ height: '300px', position: 'relative' }}>
        <Bar data={{ labels, datasets }} options={options} />
      </div>
    </div>
  );
}

export default BarChart;

