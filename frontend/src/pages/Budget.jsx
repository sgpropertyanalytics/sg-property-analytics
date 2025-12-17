import { FilterBar } from '../components/dashboard/FilterBar';

export function Budget() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1 px-6">
        <h1 className="text-3xl md:text-4xl font-bold text-slate-900 tracking-tight leading-tight">
          Budget Comparison
        </h1>
        <p className="text-slate-500 text-base font-medium">
          Compare property options within your budget range.
        </p>
      </div>

      <FilterBar />

      <div className="px-6">
        <div className="bg-white border border-gray-200 rounded-lg p-8 text-center">
          <p className="text-slate-500 text-lg">
            Budget comparison tools coming soon...
          </p>
          <p className="text-slate-400 text-sm mt-2">
            This page will help you find properties that match your budget criteria.
          </p>
        </div>
      </div>
    </div>
  );
}

