import { useState, useEffect, useMemo } from 'react';
import { useData } from '../context/DataContext';
import {
  getPriceTrends,
  getTotalVolume,
  getAvgPsf,
  getTransactions,
  getSaleTypeTrends,
  getPriceTrendsBySaleType,
  getPriceTrendsByRegion,
  getPsfTrendsByRegion,
  getMarketStatsByDistrict,
  getComparableValueAnalysis,
  getProjectsByDistrict
} from '../api/client';
import LineChart from '../components/LineChart';
import BarChart from '../components/BarChart';
import RegionChart from '../components/RegionChart';
import SaleTypeChart from '../components/SaleTypeChart';

const COLORS = {
  '2b': '#3B82F6',
  '3b': '#10B981',
  '4b': '#F59E0B',
};

const BEDROOM_LABELS = {
  '2b': '2-Bedroom',
  '3b': '3-Bedroom',
  '4b': '4-Bedroom',
};

const DISTRICT_NAMES = {
  'D01': 'Boat Quay / Raffles Place / Marina Downtown / Suntec City',
  'D02': 'Shenton Way / Tanjong Pagar',
  'D03': 'Queenstown / Alexandra / Tiong Bahru',
  'D04': 'Harbourfront / Keppel / Telok Blangah',
  'D05': 'Buona Vista / Dover / Pasir Panjang',
  'D06': 'City Hall / Fort Canning',
  'D07': 'Bugis / Rochor',
  'D08': 'Little India / Farrer Park',
  'D09': 'Orchard / Somerset / River Valley',
  'D10': 'Tanglin / Bukit Timah / Holland',
  'D11': 'Newton / Novena / Dunearn / Watten',
  'D12': 'Balestier / Whampoa / Toa Payoh / Boon Keng / Bendemeer / Kampong Bugis',
  'D13': 'Potong Pasir / Bidadari / MacPherson / Upper Aljunied',
  'D14': 'Geylang / Dakota / Paya Lebar Central / Eunos / Ubi / Aljunied',
  'D15': 'Tanjong Rhu / Amber / Meyer / Katong / Dunman / Joo Chiat / Marine Parade',
  'D16': 'Bedok / Upper East Coast / Eastwood / Kew Drive',
  'D17': 'Loyang / Changi',
  'D18': 'Tampines / Pasir Ris',
  'D19': 'Serangoon Garden / Hougang / Sengkang / Punggol',
  'D20': 'Bishan / Ang Mo Kio',
  'D21': 'Upper Bukit Timah / Clementi Park / Ulu Pandan',
  'D22': 'Jurong / Boon Lay / Tuas',
  'D23': 'Bukit Batok / Bukit Panjang / Choa Chu Kang',
  'D24': 'Lim Chu Kang / Tengah',
  'D25': 'Kranji / Woodlands',
  'D26': 'Upper Thomson / Springleaf',
  'D27': 'Yishun / Sembawang',
  'D28': 'Seletar / Yio Chu Kang',
};

const formatPrice = (value) => {
  if (!value) return '-';
  if (value >= 1000000000) return `$${(value / 1000000000).toFixed(2)}B`;
  if (value >= 1000000) return `$${(value / 1000000).toFixed(2)}M`;
  if (value >= 1000) return `$${(value / 1000).toFixed(0)}K`;
  return `$${value.toFixed(0)}`;
};

const formatPSF = (value) => {
  if (!value) return '-';
  return `$${value.toLocaleString()}`;
};

function Card({ title, children }) {
  return (
    <div style={{
      background: 'white',
      borderRadius: '12px',
      padding: '24px',
      marginBottom: '24px',
      boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
    }}>
      {title && (
        <h2 style={{
          fontSize: '18px',
          fontWeight: 600,
          color: '#111827',
          marginBottom: '20px'
        }}>
          {title}
        </h2>
      )}
      {children}
    </div>
  );
}

function Dashboard() {
  // Get centralized data from context (districts, metadata)
  const { availableDistricts, apiMetadata, loading: contextLoading } = useData();
  
  const [selectedBedrooms, setSelectedBedrooms] = useState(['2b', '3b', '4b']);
  const [selectedSegment, setSelectedSegment] = useState(null);
  const [selectedDistrict, setSelectedDistrict] = useState('all');
  const [priceTrends, setPriceTrends] = useState([]);
  const [volumeData, setVolumeData] = useState([]);
  const [psfData, setPsfData] = useState([]);
  const [saleTypeTrends, setSaleTypeTrends] = useState([]);
  const [priceTrendsBySaleType, setPriceTrendsBySaleType] = useState({});
  const [priceTrendsByRegion, setPriceTrendsByRegion] = useState([]);
  const [psfTrendsByRegion, setPsfTrendsByRegion] = useState([]);
  const [saleTypeSegment, setSaleTypeSegment] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Memoize transaction count chart data
  const transactionCountData = useMemo(() => {
    if (!priceTrends || priceTrends.length === 0) return [];
    return priceTrends.map(d => ({
      month: d.month,
      '2b_count': d['2b_count'] || 0,
      '3b_count': d['3b_count'] || 0,
      '4b_count': d['4b_count'] || 0
    }));
  }, [priceTrends]);

  // Memoize PSF trends data
  const psfTrendsData = useMemo(() => {
    if (!priceTrends || priceTrends.length === 0) return [];
    return priceTrends.map(d => ({
      month: d.month || d.quarter || '',
      '2b_price': d['2b_psf'] != null ? d['2b_psf'] : null,
      '3b_price': d['3b_psf'] != null ? d['3b_psf'] : null,
      '4b_price': d['4b_psf'] != null ? d['4b_psf'] : null,
      '2b_count': d['2b_count'] || 0,
      '3b_count': d['3b_count'] || 0,
      '4b_count': d['4b_count'] || 0,
      '2b_low_sample': d['2b_low_sample'] || false,
      '3b_low_sample': d['3b_low_sample'] || false,
      '4b_low_sample': d['4b_low_sample'] || false
    }));
  }, [priceTrends]);

  // Districts are now provided by DataContext - no need to fetch here

  // Fetch main data
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setError(null);
      const bedroomParam = selectedBedrooms.map(b => b.replace('b', '')).join(',');
      const params = {
        bedroom: bedroomParam,
        districts: selectedDistrict !== 'all' ? selectedDistrict : undefined,
        segment: selectedSegment || undefined,
        limit: 200000
      };

      try {
        const [trendsRes, volumeRes, psfRes, saleTypeRes, priceRegionRes, psfRegionRes] = await Promise.all([
          getPriceTrends(params),
          getTotalVolume(params),
          getAvgPsf(params),
          getSaleTypeTrends(params).catch(() => ({ data: { trends: [] } })),
          getPriceTrendsByRegion(params).catch(() => ({ data: { trends: [] } })),
          getPsfTrendsByRegion(params).catch(() => ({ data: { trends: [] } }))
        ]);

        setPriceTrends(trendsRes.data.trends || []);
        setVolumeData(volumeRes.data.data || []);
        setPsfData(psfRes.data.data || []);
        setSaleTypeTrends(saleTypeRes.data.trends || []);
        setPriceTrendsByRegion(priceRegionRes.data.trends || []);
        setPsfTrendsByRegion(psfRegionRes.data.trends || []);
      } catch (err) {
        console.error('Error fetching data:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [selectedBedrooms, selectedDistrict, selectedSegment]);

  // Fetch price trends by sale type separately
  useEffect(() => {
    const fetchSaleTypePriceTrends = async () => {
      const bedroomParam = selectedBedrooms.map(b => b.replace('b', '')).join(',');
      const params = {
        bedroom: bedroomParam,
        districts: selectedDistrict !== 'all' ? selectedDistrict : undefined,
        segment: saleTypeSegment || undefined
      };

      try {
        const res = await getPriceTrendsBySaleType(params);
        setPriceTrendsBySaleType(res.data.trends || {});
      } catch (err) {
        console.error('Error fetching price trends by sale type:', err);
        setPriceTrendsBySaleType({});
      }
    };
    fetchSaleTypePriceTrends();
  }, [selectedBedrooms, selectedDistrict, saleTypeSegment]);

  if (error) {
    return (
      <div style={{ padding: '32px', maxWidth: '800px', margin: '0 auto' }}>
        <div style={{
          background: '#FEE2E2',
          border: '1px solid #FCA5A5',
          borderRadius: '12px',
          padding: '24px',
          textAlign: 'center'
        }}>
          <h2 style={{ color: '#DC2626', marginBottom: '12px' }}>⚠️ Connection Error</h2>
          <p style={{ color: '#7F1D1D', marginBottom: '16px' }}>
            Cannot connect to API. Please start the Flask backend:
          </p>
          <code style={{
            display: 'block',
            background: '#FEF2F2',
            padding: '12px',
            borderRadius: '6px',
            color: '#991B1B'
          }}>
            cd backend && python app.py
          </code>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: '32px', maxWidth: '1400px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: '32px' }}>
        <h1 style={{ fontSize: '28px', fontWeight: 700, color: '#111827', marginBottom: '8px' }}>
          Singapore Private Condo Resale Statistics
        </h1>
        <p style={{ color: '#6B7280', fontSize: '16px' }}>
          Transaction data breakdown by postal district and bedroom type
        </p>
      </div>

      {/* Filters */}
      <Card>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', alignItems: 'center' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: 500, color: '#374151' }}>
              Bedroom Types
            </label>
            <div style={{ display: 'flex', gap: '8px' }}>
              {['2b', '3b', '4b'].map(bedroom => (
                <button
                  key={bedroom}
                  onClick={() => {
                    if (selectedBedrooms.includes(bedroom)) {
                      setSelectedBedrooms(selectedBedrooms.filter(b => b !== bedroom));
                    } else {
                      setSelectedBedrooms([...selectedBedrooms, bedroom]);
                    }
                  }}
                  style={{
                    padding: '8px 16px',
                    borderRadius: '6px',
                    border: 'none',
                    background: selectedBedrooms.includes(bedroom) ? COLORS[bedroom] : '#E5E7EB',
                    color: selectedBedrooms.includes(bedroom) ? 'white' : '#6B7280',
                    cursor: 'pointer',
                    fontWeight: 500,
                    fontSize: '14px'
                  }}
                >
                  {BEDROOM_LABELS[bedroom]}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: 500, color: '#374151' }}>
              Market Segment
            </label>
            <select
              value={selectedSegment || 'all'}
              onChange={(e) => setSelectedSegment(e.target.value === 'all' ? null : e.target.value)}
              style={{
                padding: '8px 12px',
                borderRadius: '6px',
                border: '1px solid #D1D5DB',
                fontSize: '14px',
                minWidth: '150px'
              }}
            >
              <option value="all">All Segments</option>
              <option value="CCR">CCR</option>
              <option value="RCR">RCR</option>
              <option value="OCR">OCR</option>
            </select>
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: 500, color: '#374151' }}>
              District
            </label>
            <select
              value={selectedDistrict}
              onChange={(e) => setSelectedDistrict(e.target.value)}
              style={{
                padding: '8px 12px',
                borderRadius: '6px',
                border: '1px solid #D1D5DB',
                fontSize: '14px',
                minWidth: '200px'
              }}
            >
              <option value="all">All Districts</option>
              {availableDistricts.map(district => (
                <option key={district} value={district}>
                  {district}: {DISTRICT_NAMES[district] ? `(${DISTRICT_NAMES[district]})` : ''}
                </option>
              ))}
            </select>
          </div>
        </div>
      </Card>

      {(loading || contextLoading) ? (
        <div style={{ textAlign: 'center', padding: '60px', color: '#6B7280' }}>
          <div style={{ fontSize: '32px', marginBottom: '12px' }}>⏳</div>
          Loading data...
        </div>
      ) : (
        <>
          {/* Chart 1: Price Trends */}
          <Card title="📈 Price Trend by Quarter (Median Price & Median Price by Region)">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '24px' }}>
              <LineChart
                data={priceTrends}
                selectedBedrooms={selectedBedrooms}
                valueFormatter={formatPrice}
                title="Median Price"
              />
              {priceTrendsByRegion && priceTrendsByRegion.length > 0 && (
                <RegionChart
                  data={priceTrendsByRegion}
                  valueFormatter={formatPrice}
                  title="Median Price by Region"
                />
              )}
            </div>
          </Card>

          {/* Chart 2: PSF Trends */}
          <Card title="📊 PSF Trend by Quarter (Median PSF & Median PSF by Region)">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '24px' }}>
              <LineChart
                data={psfTrendsData}
                selectedBedrooms={selectedBedrooms}
                valueFormatter={formatPSF}
                title="Median PSF"
              />
              {psfTrendsByRegion && psfTrendsByRegion.length > 0 && (
                <RegionChart
                  data={psfTrendsByRegion}
                  valueFormatter={formatPSF}
                  title="Median PSF by Region"
                  isPSF={true}
                />
              )}
            </div>
          </Card>

          {/* Chart: Transaction Count by Bedroom Type */}
          {transactionCountData && transactionCountData.length > 0 && (
            <Card title="📊 Transaction Count by Bedroom Type">
              <BarChart
                data={transactionCountData}
                selectedBedrooms={selectedBedrooms}
                title="Transaction Count"
                beginAtZero={true}
              />
            </Card>
          )}

          {/* Chart: New Sale vs Resale Transaction Count */}
          {saleTypeTrends.length > 0 && (
            <Card title="📊 Transaction Count: New Sale vs Resale">
              <SaleTypeChart data={saleTypeTrends} />
            </Card>
          )}

          {/* Chart: Median Price by Sale Type */}
          {Object.keys(priceTrendsBySaleType).length > 0 && (
            <Card title="📈 Median Price: New Sale vs Resale by Bedroom Type">
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: 500, color: '#374151' }}>
                  Market Segment (for this chart only)
                </label>
                <select
                  value={saleTypeSegment || 'all'}
                  onChange={(e) => setSaleTypeSegment(e.target.value === 'all' ? null : e.target.value)}
                  style={{
                    padding: '8px 12px',
                    borderRadius: '6px',
                    border: '1px solid #D1D5DB',
                    fontSize: '14px',
                    minWidth: '150px'
                  }}
                >
                  <option value="all">All Segments</option>
                  <option value="CCR">CCR</option>
                  <option value="RCR">RCR</option>
                  <option value="OCR">OCR</option>
                </select>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '24px' }}>
                {selectedBedrooms.map(bedroom => {
                  const bedroomKey = bedroom.replace('b', '');
                  const saleTypeData = priceTrendsBySaleType[bedroomKey];
                  if (!saleTypeData || !saleTypeData.trends || saleTypeData.trends.length === 0) return null;
                  
                  return (
                    <div key={bedroom}>
                      <h3 style={{ fontSize: '14px', color: '#6B7280', marginBottom: '12px' }}>
                        {BEDROOM_LABELS[bedroom]}
                      </h3>
                      <LineChart
                        data={saleTypeData.trends.map(d => ({
                          month: d.quarter,
                          '2b_price': d.new_sale_price,
                          '3b_price': d.resale_price,
                          '4b_price': null
                        }))}
                        selectedBedrooms={['2b', '3b']}
                        valueFormatter={formatPrice}
                        title=""
                      />
                    </div>
                  );
                })}
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

export default Dashboard;

