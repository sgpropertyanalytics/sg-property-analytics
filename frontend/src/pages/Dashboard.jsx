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
    <div className="bg-white rounded-xl p-4 md:p-6 mb-6 shadow-sm">
      {title && (
        <h2 className="text-base md:text-lg font-semibold text-gray-900 mb-4 md:mb-5">
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
      <div className="p-4 md:p-8 max-w-2xl mx-auto">
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
          <h2 className="text-red-600 font-semibold mb-3 text-lg">⚠️ Connection Error</h2>
          <p className="text-red-800 mb-4 text-sm md:text-base">
            Cannot connect to API. Please start the Flask backend:
          </p>
          <code className="block bg-red-100 p-3 rounded-md text-red-900 text-xs md:text-sm">
            cd backend && python app.py
          </code>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 lg:p-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-6 md:mb-8">
        <h1 className="text-xl md:text-2xl lg:text-3xl font-bold text-gray-900 mb-2">
          Singapore Private Condo Resale Statistics
        </h1>
        <p className="text-sm md:text-base text-gray-600">
          Transaction data breakdown by postal district and bedroom type
        </p>
        {apiMetadata && (
          <p className="text-xs md:text-sm text-gray-400 mt-1">
            {apiMetadata.row_count?.toLocaleString?.() || apiMetadata.row_count} transactions ·
            {' '}last updated {apiMetadata.last_updated || 'n/a'}
          </p>
        )}
      </div>

      {/* Filters */}
      <Card>
        <div className="flex flex-col md:flex-row flex-wrap gap-4 md:gap-4 items-start md:items-center">
          <div className="w-full md:w-auto">
            <label className="block mb-2 text-xs md:text-sm font-medium text-gray-700">
              Bedroom Types
            </label>
            <div className="flex flex-wrap gap-2">
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
                  className={`px-3 md:px-4 py-2 rounded-md border-none font-medium text-xs md:text-sm cursor-pointer transition-colors ${
                    selectedBedrooms.includes(bedroom)
                      ? `text-white ${bedroom === '2b' ? 'bg-blue-500' : bedroom === '3b' ? 'bg-green-500' : 'bg-amber-500'}`
                      : 'bg-gray-200 text-gray-600'
                  }`}
                >
                  {BEDROOM_LABELS[bedroom]}
                </button>
              ))}
            </div>
          </div>

          <div className="w-full md:w-auto">
            <label className="block mb-2 text-xs md:text-sm font-medium text-gray-700">
              Market Segment
            </label>
            <select
              value={selectedSegment || 'all'}
              onChange={(e) => setSelectedSegment(e.target.value === 'all' ? null : e.target.value)}
              className="w-full md:w-auto px-3 py-2 rounded-md border border-gray-300 text-xs md:text-sm min-w-[120px] md:min-w-[150px]"
            >
              <option value="all">All Segments</option>
              <option value="CCR">CCR</option>
              <option value="RCR">RCR</option>
              <option value="OCR">OCR</option>
            </select>
          </div>

          <div className="w-full md:w-auto">
            <label className="block mb-2 text-xs md:text-sm font-medium text-gray-700">
              District
            </label>
            <select
              value={selectedDistrict}
              onChange={(e) => setSelectedDistrict(e.target.value)}
              className="w-full md:w-auto px-3 py-2 rounded-md border border-gray-300 text-xs md:text-sm min-w-[120px] md:min-w-[200px]"
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
        <div className="text-center py-12 md:py-16 text-gray-500">
          <div className="text-3xl md:text-4xl mb-3">⏳</div>
          <div className="text-sm md:text-base">Loading data...</div>
        </div>
      ) : (
        <>
          {/* Chart 1: Price Trends */}
          <Card title="📈 Price Trend by Quarter (Median Price & Median Price by Region)">
            <div className="w-full overflow-x-auto">
              <div className="min-w-[600px] md:min-w-0 grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
                <div className="bg-white p-2 md:p-4 rounded-lg">
                  <LineChart
                    data={priceTrends}
                    selectedBedrooms={selectedBedrooms}
                    valueFormatter={formatPrice}
                    title="Median Price"
                  />
                </div>
                {priceTrendsByRegion && priceTrendsByRegion.length > 0 && (
                  <div className="bg-white p-2 md:p-4 rounded-lg">
                    <RegionChart
                      data={priceTrendsByRegion}
                      valueFormatter={formatPrice}
                      title="Median Price by Region"
                    />
                  </div>
                )}
              </div>
            </div>
          </Card>

          {/* Chart 2: PSF Trends */}
          <Card title="📊 PSF Trend by Quarter (Median PSF & Median PSF by Region)">
            <div className="w-full overflow-x-auto">
              <div className="min-w-[600px] md:min-w-0 grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
                <div className="bg-white p-2 md:p-4 rounded-lg">
                  <LineChart
                    data={psfTrendsData}
                    selectedBedrooms={selectedBedrooms}
                    valueFormatter={formatPSF}
                    title="Median PSF"
                  />
                </div>
                {psfTrendsByRegion && psfTrendsByRegion.length > 0 && (
                  <div className="bg-white p-2 md:p-4 rounded-lg">
                    <RegionChart
                      data={psfTrendsByRegion}
                      valueFormatter={formatPSF}
                      title="Median PSF by Region"
                      isPSF={true}
                    />
                  </div>
                )}
              </div>
            </div>
          </Card>

          {/* Chart: Transaction Count by Bedroom Type */}
          {transactionCountData && transactionCountData.length > 0 && (
            <Card title="📊 Transaction Count by Bedroom Type">
              <div className="w-full overflow-x-auto">
                <div className="min-w-[400px] md:min-w-0">
                  <BarChart
                    data={transactionCountData}
                    selectedBedrooms={selectedBedrooms}
                    title="Transaction Count"
                    beginAtZero={true}
                  />
                </div>
              </div>
            </Card>
          )}

          {/* Chart: New Sale vs Resale Transaction Count */}
          {saleTypeTrends.length > 0 && (
            <Card title="📊 Transaction Count: New Sale vs Resale">
              <div className="w-full overflow-x-auto">
                <div className="min-w-[400px] md:min-w-0">
                  <SaleTypeChart data={saleTypeTrends} />
                </div>
              </div>
            </Card>
          )}

          {/* Chart: Median Price by Sale Type */}
          {Object.keys(priceTrendsBySaleType).length > 0 && (
            <Card title="📈 Median Price: New Sale vs Resale by Bedroom Type">
              <div className="mb-4">
                <label className="block mb-2 text-xs md:text-sm font-medium text-gray-700">
                  Market Segment (for this chart only)
                </label>
                <select
                  value={saleTypeSegment || 'all'}
                  onChange={(e) => setSaleTypeSegment(e.target.value === 'all' ? null : e.target.value)}
                  className="w-full md:w-auto px-3 py-2 rounded-md border border-gray-300 text-xs md:text-sm min-w-[120px] md:min-w-[150px]"
                >
                  <option value="all">All Segments</option>
                  <option value="CCR">CCR</option>
                  <option value="RCR">RCR</option>
                  <option value="OCR">OCR</option>
                </select>
              </div>
              <div className="w-full overflow-x-auto">
                <div className="min-w-[600px] md:min-w-0 grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
                  {selectedBedrooms.map(bedroom => {
                    const bedroomKey = bedroom.replace('b', '');
                    const saleTypeData = priceTrendsBySaleType[bedroomKey];
                    if (!saleTypeData || !saleTypeData.trends || saleTypeData.trends.length === 0) return null;
                    
                    return (
                      <div key={bedroom} className="bg-white p-2 md:p-4 rounded-lg">
                        <h3 className="text-xs md:text-sm text-gray-600 mb-3">
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
              </div>
            </Card>
          )}

          {/* Market Overview - Pulse vs Baseline */}
          {marketStats && marketStats.short_term && marketStats.long_term && (
            <Card title="📊 Market Overview: Pulse vs Baseline">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
                {['short_term', 'long_term'].map(key => {
                  const block = marketStats[key];
                  if (!block) return null;
                  const overallPrice = block.overall?.price || {};
                  const overallPsf = block.overall?.psf || {};
                  return (
                    <div key={key} className="p-3 md:p-4 rounded-lg bg-gray-50 border border-gray-200">
                      <h3 className="text-sm md:text-base font-semibold text-gray-900 mb-2">
                        {block.label || (key === 'short_term' ? 'Pulse (Last Few Months)' : 'Baseline (Longer Term)')}
                      </h3>
                      <p className="text-xs md:text-sm text-gray-600 mb-2">Overall Market (all bedroom types)</p>
                      <div className="grid grid-cols-2 gap-2 md:gap-3 text-xs md:text-sm text-gray-700">
                        <div>
                          <div className="font-medium mb-1">Median Price</div>
                          <div>{overallPrice.median ? formatPrice(overallPrice.median) : '-'}</div>
                          <div className="text-gray-500 mt-1 text-xs">
                            25th: {overallPrice['25th'] ? formatPrice(overallPrice['25th']) : '-'} ·
                            {' '}75th: {overallPrice['75th'] ? formatPrice(overallPrice['75th']) : '-'}
                          </div>
                        </div>
                        <div>
                          <div className="font-medium mb-1">Median PSF</div>
                          <div>{overallPsf.median ? formatPSF(overallPsf.median) : '-'}</div>
                          <div className="text-gray-500 mt-1 text-xs">
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
              <p className="text-xs md:text-sm text-gray-600 mb-3">
                Short-term view by district (Pulse). Sorted by median PSF, top 10 districts.
              </p>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-xs md:text-sm">
                  <thead>
                    <tr className="bg-gray-100">
                      <th className="text-left p-2 border-b border-gray-200">District</th>
                      <th className="text-right p-2 border-b border-gray-200">Median Price</th>
                      <th className="text-right p-2 border-b border-gray-200">Median PSF</th>
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
                          <td className="p-2 border-b border-gray-200">{row.district}</td>
                          <td className="p-2 border-b border-gray-200 text-right">
                            {row.priceMedian ? formatPrice(row.priceMedian) : '-'}
                          </td>
                          <td className="p-2 border-b border-gray-200 text-right">
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
            <p className="text-xs md:text-sm text-gray-600 mb-3">
              Find transactions around a target price band for the selected bedroom types and (optionally) district.
            </p>
            <div className="flex flex-col sm:flex-row flex-wrap gap-3 md:gap-4 items-end mb-4">
              <div className="w-full sm:w-auto">
                <label className="block mb-1 text-xs md:text-sm font-medium text-gray-700">
                  Target Price (SGD)
                </label>
                <input
                  type="number"
                  defaultValue={2500000}
                  onChange={(e) => {
                    const value = parseFloat(e.target.value || '0');
                    setBuyBoxResult(prev => prev ? { ...prev, _target_price: value } : prev);
                  }}
                  className="w-full sm:w-auto px-3 py-2 rounded-md border border-gray-300 text-xs md:text-sm min-w-[140px] md:min-w-[160px]"
                />
              </div>
              <div className="w-full sm:w-auto">
                <label className="block mb-1 text-xs md:text-sm font-medium text-gray-700">
                  Band (± SGD)
                </label>
                <input
                  type="number"
                  defaultValue={100000}
                  onChange={(e) => {
                    const value = parseFloat(e.target.value || '0');
                    setBuyBoxResult(prev => prev ? { ...prev, _band: value } : prev);
                  }}
                  className="w-full sm:w-auto px-3 py-2 rounded-md border border-gray-300 text-xs md:text-sm min-w-[120px] md:min-w-[140px]"
                />
              </div>
              <button
                type="button"
                onClick={runBuyBoxAnalysis}
                disabled={buyBoxLoading}
                className={`w-full sm:w-auto px-4 md:px-5 py-2 md:py-2.5 rounded-md border-none bg-blue-600 text-white font-medium text-xs md:text-sm cursor-pointer transition-opacity ${
                  buyBoxLoading ? 'opacity-70 cursor-default' : 'hover:bg-blue-700'
                }`}
              >
                {buyBoxLoading ? 'Running analysis...' : 'Run Analysis'}
              </button>
            </div>

            {buyBoxResult && (
              <>
                <p className="text-xs md:text-sm text-gray-600 mb-2">
                  Found <strong>{buyBoxResult.summary?.count ?? 0}</strong> comparable transactions.
                </p>
                {buyBoxResult.points && buyBoxResult.points.length > 0 && (
                  <div className="max-h-80 overflow-y-auto rounded-lg border border-gray-200">
                    <div className="overflow-x-auto">
                      <table className="w-full border-collapse text-xs md:text-sm min-w-[500px]">
                        <thead>
                          <tr className="bg-gray-100">
                            <th className="text-left p-2 border-b border-gray-200">Project</th>
                            <th className="text-right p-2 border-b border-gray-200">District</th>
                            <th className="text-right p-2 border-b border-gray-200">Price</th>
                            <th className="text-right p-2 border-b border-gray-200">PSF</th>
                            <th className="text-right p-2 border-b border-gray-200">Bedrooms</th>
                          </tr>
                        </thead>
                        <tbody>
                          {buyBoxResult.points.slice(0, 50).map((p, idx) => (
                            <tr key={idx}>
                              <td className="p-2 border-b border-gray-200">{p.project_name}</td>
                              <td className="p-2 border-b border-gray-200 text-right">{p.district}</td>
                              <td className="p-2 border-b border-gray-200 text-right">
                                {p.price ? formatPrice(p.price) : '-'}
                              </td>
                              <td className="p-2 border-b border-gray-200 text-right">
                                {p.psf ? formatPSF(p.psf) : '-'}
                              </td>
                              <td className="p-2 border-b border-gray-200 text-right">{p.bedroom_count}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
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
