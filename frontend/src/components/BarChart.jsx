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
import { COLORS, BEDROOM_LABELS } from '../constants';

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend
);

function BarChart({ data, selectedBedrooms, valueFormatter, title, horizontal = false, stacked = false, beginAtZero = true }) {
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

