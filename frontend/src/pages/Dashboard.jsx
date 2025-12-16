import { useState, useEffect, useMemo } from 'react';
import { useData } from '../context/DataContext';
import {
  getPriceTrends,
  getTotalVolume,
  getAvgPsf,
  getSaleTypeTrends,
  getPriceTrendsBySaleType,
  getPriceTrendsByRegion,
  getPsfTrendsByRegion,
  getMarketStats,
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
  const [marketStats, setMarketStats] = useState(null);
  const [marketStatsByDistrict, setMarketStatsByDistrict] = useState(null);
  const [buyBoxResult, setBuyBoxResult] = useState(null);
  const [buyBoxLoading, setBuyBoxLoading] = useState(false);
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

  // Fetch market-wide stats once (pre-computed dual-view analytics)
  useEffect(() => {
    const fetchMarketStats = async () => {
      try {
        const [marketRes, marketDistRes] = await Promise.all([
          getMarketStats().catch(() => ({ data: null })),
          getMarketStatsByDistrict().catch(() => ({ data: null }))
        ]);
        setMarketStats(marketRes.data || null);
        setMarketStatsByDistrict(marketDistRes.data || null);
      } catch (err) {
        console.error('Error fetching market stats:', err);
      }
    };
    fetchMarketStats();
  }, []);

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

  const runBuyBoxAnalysis = async () => {
    setBuyBoxLoading(true);
    try {
      const params = {
        target_price: 2500000,
        band: 100000,
        bedroom: selectedBedrooms.map(b => b.replace('b', '')).join(','),
        districts: selectedDistrict !== 'all' ? selectedDistrict : undefined
      };
      const res = await getComparableValueAnalysis(params);
      setBuyBoxResult(res.data || null);
    } catch (err) {
      console.error('Error running comparable value analysis:', err);
      setBuyBoxResult(null);
    } finally {
      setBuyBoxLoading(false);
    }
  };

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
        {apiMetadata && (
          <p style={{ color: '#9CA3AF', fontSize: '13px', marginTop: '4px' }}>
            {apiMetadata.row_count?.toLocaleString?.() || apiMetadata.row_count} transactions ·
            {' '}last updated {apiMetadata.last_updated || 'n/a'}
          </p>
        )}
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

          {/* Market Overview - Pulse vs Baseline */}
          {marketStats && marketStats.short_term && marketStats.long_term && (
            <Card title="📊 Market Overview: Pulse vs Baseline">
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '24px' }}>
                {['short_term', 'long_term'].map(key => {
                  const block = marketStats[key];
                  if (!block) return null;
                  const overallPrice = block.overall?.price || {};
                  const overallPsf = block.overall?.psf || {};
                  return (
                    <div key={key} style={{ padding: '12px 16px', borderRadius: '8px', background: '#F9FAFB', border: '1px solid #E5E7EB' }}>
                      <h3 style={{ fontSize: '15px', fontWeight: 600, color: '#111827', marginBottom: '8px' }}>
                        {block.label || (key === 'short_term' ? 'Pulse (Last Few Months)' : 'Baseline (Longer Term)')}
                      </h3>
                      <p style={{ fontSize: '13px', color: '#6B7280', marginBottom: '8px' }}>Overall Market (all bedroom types)</p>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '8px', fontSize: '13px', color: '#374151' }}>
                        <div>
                          <div style={{ fontWeight: 500, marginBottom: '4px' }}>Median Price</div>
                          <div>{overallPrice.median ? formatPrice(overallPrice.median) : '-'}</div>
                          <div style={{ color: '#9CA3AF', marginTop: '2px' }}>
                            25th: {overallPrice['25th'] ? formatPrice(overallPrice['25th']) : '-'} ·
                            {' '}75th: {overallPrice['75th'] ? formatPrice(overallPrice['75th']) : '-'}
                          </div>
                        </div>
                        <div>
                          <div style={{ fontWeight: 500, marginBottom: '4px' }}>Median PSF</div>
                          <div>{overallPsf.median ? formatPSF(overallPsf.median) : '-'}</div>
                          <div style={{ color: '#9CA3AF', marginTop: '2px' }}>
                            25th: {overallPsf['25th'] ? formatPSF(overallPsf['25th']) : '-'} ·
                            {' '}75th: {overallPsf['75th'] ? formatPSF(overallPsf['75th']) : '-'}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          )}

          {/* Market Stats by District (Top 10 by Median PSF - Short Term) */}
          {marketStatsByDistrict && marketStatsByDistrict.short_term && marketStatsByDistrict.short_term.by_district && (
            <Card title="🏙 District Market Snapshot (Short-Term Median PSF)">
              <p style={{ fontSize: '13px', color: '#6B7280', marginBottom: '12px' }}>
                Short-term view by district (Pulse). Sorted by median PSF, top 10 districts.
              </p>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                  <thead>
                    <tr style={{ background: '#F3F4F6' }}>
                      <th style={{ textAlign: 'left', padding: '8px', borderBottom: '1px solid #E5E7EB' }}>District</th>
                      <th style={{ textAlign: 'right', padding: '8px', borderBottom: '1px solid #E5E7EB' }}>Median Price</th>
                      <th style={{ textAlign: 'right', padding: '8px', borderBottom: '1px solid #E5E7EB' }}>Median PSF</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(marketStatsByDistrict.short_term.by_district)
                      .map(([district, stats]) => ({
                        district,
                        priceMedian: stats.price?.median || null,
                        psfMedian: stats.psf?.median || null
                      }))
                      .sort((a, b) => (b.psfMedian || 0) - (a.psfMedian || 0))
                      .slice(0, 10)
                      .map(row => (
                        <tr key={row.district}>
                          <td style={{ padding: '8px', borderBottom: '1px solid #E5E7EB' }}>{row.district}</td>
                          <td style={{ padding: '8px', borderBottom: '1px solid #E5E7EB', textAlign: 'right' }}>
                            {row.priceMedian ? formatPrice(row.priceMedian) : '-'}
                          </td>
                          <td style={{ padding: '8px', borderBottom: '1px solid #E5E7EB', textAlign: 'right' }}>
                            {row.psfMedian ? formatPSF(row.psfMedian) : '-'}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {/* Comparable Value Analysis (Buy Box) */}
          <Card title="🎯 Comparable Value Analysis (Buy Box)">
            <p style={{ fontSize: '13px', color: '#6B7280', marginBottom: '12px' }}>
              Find transactions around a target price band for the selected bedroom types and (optionally) district.
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', alignItems: 'flex-end', marginBottom: '16px' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px', fontWeight: 500, color: '#374151' }}>
                  Target Price (SGD)
                </label>
                <input
                  type="number"
                  defaultValue={2500000}
                  onChange={(e) => {
                    const value = parseFloat(e.target.value || '0');
                    setBuyBoxResult(prev => prev ? { ...prev, _target_price: value } : prev);
                  }}
                  style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid #D1D5DB', fontSize: '14px', minWidth: '160px' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px', fontWeight: 500, color: '#374151' }}>
                  Band (± SGD)
                </label>
                <input
                  type="number"
                  defaultValue={100000}
                  onChange={(e) => {
                    const value = parseFloat(e.target.value || '0');
                    setBuyBoxResult(prev => prev ? { ...prev, _band: value } : prev);
                  }}
                  style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid #D1D5DB', fontSize: '14px', minWidth: '140px' }}
                />
              </div>
              <button
                type="button"
                onClick={runBuyBoxAnalysis}
                disabled={buyBoxLoading}
                style={{
                  padding: '10px 18px',
                  borderRadius: '6px',
                  border: 'none',
                  background: '#2563EB',
                  color: 'white',
                  fontWeight: 500,
                  fontSize: '14px',
                  cursor: buyBoxLoading ? 'default' : 'pointer',
                  opacity: buyBoxLoading ? 0.7 : 1
                }}
              >
                {buyBoxLoading ? 'Running analysis...' : 'Run Analysis'}
              </button>
            </div>

            {buyBoxResult && (
              <>
                <p style={{ fontSize: '13px', color: '#6B7280', marginBottom: '8px' }}>
                  Found <strong>{buyBoxResult.summary?.count ?? 0}</strong> comparable transactions.
                </p>
                {buyBoxResult.points && buyBoxResult.points.length > 0 && (
                  <div style={{ maxHeight: '320px', overflowY: 'auto', borderRadius: '8px', border: '1px solid #E5E7EB' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                      <thead>
                        <tr style={{ background: '#F3F4F6' }}>
                          <th style={{ textAlign: 'left', padding: '8px', borderBottom: '1px solid #E5E7EB' }}>Project</th>
                          <th style={{ textAlign: 'right', padding: '8px', borderBottom: '1px solid #E5E7EB' }}>District</th>
                          <th style={{ textAlign: 'right', padding: '8px', borderBottom: '1px solid #E5E7EB' }}>Price</th>
                          <th style={{ textAlign: 'right', padding: '8px', borderBottom: '1px solid #E5E7EB' }}>PSF</th>
                          <th style={{ textAlign: 'right', padding: '8px', borderBottom: '1px solid #E5E7EB' }}>Bedrooms</th>
                        </tr>
                      </thead>
                      <tbody>
                        {buyBoxResult.points.slice(0, 50).map((p, idx) => (
                          <tr key={idx}>
                            <td style={{ padding: '8px', borderBottom: '1px solid #E5E7EB' }}>{p.project_name}</td>
                            <td style={{ padding: '8px', borderBottom: '1px solid #E5E7EB', textAlign: 'right' }}>{p.district}</td>
                            <td style={{ padding: '8px', borderBottom: '1px solid #E5E7EB', textAlign: 'right' }}>
                              {p.price ? formatPrice(p.price) : '-'}
                            </td>
                            <td style={{ padding: '8px', borderBottom: '1px solid #E5E7EB', textAlign: 'right' }}>
                              {p.psf ? formatPSF(p.psf) : '-'}
                            </td>
                            <td style={{ padding: '8px', borderBottom: '1px solid #E5E7EB', textAlign: 'right' }}>{p.bedroom_count}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}
          </Card>
        </>
      )}
    </div>
  );
}

export default Dashboard;

