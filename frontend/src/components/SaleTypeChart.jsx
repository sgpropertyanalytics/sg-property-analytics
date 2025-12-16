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

function SaleTypeChart({ data }) {
  if (!data || data.length === 0) {
    return <div>No data available</div>;
  }

  const labels = data.map(d => d.quarter || '');
  const newSaleData = data.map(d => d.new_sale || 0);
  const resaleData = data.map(d => d.resale || 0);

  const chartData = {
    labels,
    datasets: [
      {
        label: 'New Sale',
        data: newSaleData,
        borderColor: '#10B981',
        backgroundColor: '#10B98120',
        tension: 0.4,
        spanGaps: true,
        pointRadius: 4,
        pointHoverRadius: 6,
        pointHitRadius: 10,
        fill: false
      },
      {
        label: 'Resale',
        data: resaleData,
        borderColor: '#3B82F6',
        backgroundColor: '#3B82F620',
        tension: 0.4,
        spanGaps: true,
        pointRadius: 4,
        pointHoverRadius: 6,
        pointHitRadius: 10,
        fill: false
      }
    ]
  };

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
            return context.dataset.label + ': ' + (context.parsed.y || 0).toLocaleString();
          }
        }
      }
    },
    scales: {
      y: {
        beginAtZero: true,
        ticks: {
          callback: function(value) {
            return value.toLocaleString();
          }
        }
      },
      x: {
        ticks: {
          maxRotation: 45,
          minRotation: 45
        }
      }
    }
  };

  return (
    <div style={{ height: '300px', position: 'relative' }}>
      <Line data={chartData} options={options} />
    </div>
  );
}

export default SaleTypeChart;

