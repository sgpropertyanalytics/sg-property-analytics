import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import { COLORS, BEDROOM_LABELS } from '../constants';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
);

function LineChart({ data, selectedBedrooms, valueFormatter, title }) {
  if (!data || data.length === 0) {
    return <div>No data available</div>;
  }

  const labels = data.map(d => d.month || d.quarter || '');
  
  const datasets = selectedBedrooms.map(bedroom => {
    const priceKey = `${bedroom}_price`;
    const countKey = `${bedroom}_count`;
    const lowSampleKey = `${bedroom}_low_sample`;
    
    const chartData = data.map(d => {
      const value = d[priceKey];
      // Return null for missing data - Chart.js will bridge gaps
      return value != null && value !== undefined ? value : null;
    });

    return {
      label: BEDROOM_LABELS[bedroom] || bedroom,
      data: chartData,
      borderColor: COLORS[bedroom] || '#6B7280',
      backgroundColor: (COLORS[bedroom] || '#6B7280') + '20',
      tension: 0.4,
      spanGaps: false,
      pointRadius: 4,
      pointHoverRadius: 6,
      pointHitRadius: 10,
      pointBackgroundColor: data.map((d, idx) => {
        const isLowSample = d[lowSampleKey] || false;
        return isLowSample ? '#F59E0B' : COLORS[bedroom] || '#6B7280';
      }),
      fill: false,
    };
  });

  const options = {
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
        filter: function(tooltipItem) {
          return tooltipItem.parsed.y != null;
        },
        callbacks: {
          label: function(context) {
            const value = context.parsed.y;
            if (value == null || isNaN(value)) {
              return null;
            }
            const dataIndex = context.dataIndex;
            const bedroomKey = context.dataset.label.toLowerCase().replace('-bedroom', 'b');
            const originalData = data[dataIndex];
            const txnCount = originalData?.[`${bedroomKey}_count`] || 0;
            const isLowSample = originalData?.[`${bedroomKey}_low_sample`] || false;
            
            let label = context.dataset.label + ': ' + (valueFormatter ? valueFormatter(value) : value);
            if (isLowSample && txnCount > 0) {
              label += ` (⚠️ Low sample: ${txnCount} txn)`;
            } else if (txnCount > 0) {
              label += ` (${txnCount} txn)`;
            }
            return label;
          }
        }
      }
    },
    scales: {
      x: {
        ticks: {
          maxRotation: 45,
          minRotation: 45,
          autoSkip: false
        },
        grid: {
          display: true
        }
      },
      y: {
        beginAtZero: false,
        ticks: {
          callback: function(value) {
            if (value == null || isNaN(value)) return '';
            return valueFormatter ? valueFormatter(value) : value;
          }
        },
        grid: {
          display: true
        }
      }
    },
    elements: {
      point: {
        radius: 4,
        hoverRadius: 6
      },
      line: {
        borderWidth: 2
      }
    }
  };

  return (
    <div>
      {title && <h3 style={{ fontSize: '14px', color: '#6B7280', marginBottom: '12px' }}>{title}</h3>}
      <div style={{ height: '300px', position: 'relative' }}>
        <Line data={{ labels, datasets }} options={options} />
      </div>
    </div>
  );
}

export default LineChart;

