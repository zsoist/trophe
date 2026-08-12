'use client';

import ClientFoodHeatmap from '@/components/coach/ClientFoodHeatmap';
import MealQualityTimeline from '@/components/coach/MealQualityTimeline';
import ProgressComparison from '@/components/coach/ProgressComparison';
import ProteinDistributionAnalyzer from '@/components/coach/ProteinDistributionAnalyzer';
import WeekendAnalysis from '@/components/coach/WeekendAnalysis';
import { Panel } from '@/components/coach/PanelGate';

type MealQuality = {
  name: string;
  score: number;
  grade: 'A' | 'B' | 'C' | 'D';
  time?: string;
};

type MealProtein = {
  name: string;
  protein: number;
};

type PeriodData = {
  avgCalories: number;
  avgProtein: number;
  mealsPerDay: number;
};

type ProgressWindow = {
  avgCalories: number;
  avgProtein: number;
  adherence: number;
  weight: number;
};

type ClientAnalyticsPanelsProps = {
  panelEditMode: boolean;
  panelVisible: (id: string) => boolean;
  titles: {
    mealQuality: string;
    proteinDistribution: string;
    foodHeatmap: string;
    foodHeatmapHeading: string;
    weekendAnalysis: string;
    twoWeekComparison: string;
  };
  mealQualityData: MealQuality[];
  proteinDistribution: MealProtein[];
  foodHeatmapData: Array<{ date: string; count: number }>;
  weekendAnalysisData: {
    weekday: PeriodData;
    weekend: PeriodData;
  };
  progressComparisonData: {
    thisWeek: ProgressWindow;
    lastWeek: ProgressWindow;
  };
};

export default function ClientAnalyticsPanels({
  panelEditMode,
  panelVisible,
  titles,
  mealQualityData,
  proteinDistribution,
  foodHeatmapData,
  weekendAnalysisData,
  progressComparisonData,
}: ClientAnalyticsPanelsProps) {
  return (
    <div className="client-analytics-deferred">
      {(panelEditMode || panelVisible('mealQuality') || panelVisible('proteinDistribution')) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
          <Panel id="mealQuality" title={titles.mealQuality}>
            <div className="glass p-5 h-full">
              <h2 className="font-semibold text-[var(--content-primary)] mb-3 text-sm">Meal Quality (Today)</h2>
              {mealQualityData.length > 0 ? (
                <MealQualityTimeline meals={mealQualityData} />
              ) : (
                <p className="text-[var(--content-muted)] text-sm text-center py-4">No meals logged today</p>
              )}
            </div>
          </Panel>
          <Panel id="proteinDistribution" title={titles.proteinDistribution}>
            <div className="glass p-5 h-full">
              <h2 className="font-semibold text-[var(--content-primary)] mb-3 text-sm">Protein Distribution</h2>
              {proteinDistribution.length > 0 ? (
                <ProteinDistributionAnalyzer meals={proteinDistribution} />
              ) : (
                <p className="text-[var(--content-muted)] text-sm text-center py-4">No meals logged today</p>
              )}
            </div>
          </Panel>
        </div>
      )}

      <Panel id="foodHeatmap" title={titles.foodHeatmap}>
        <div className="glass p-5 mb-4">
          <h2 className="font-semibold text-[var(--content-primary)] mb-3 text-sm">{titles.foodHeatmapHeading}</h2>
          <ClientFoodHeatmap data={foodHeatmapData} />
        </div>
      </Panel>

      {(panelEditMode || panelVisible('weekendAnalysis') || panelVisible('twoWeekComparison')) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
          <Panel id="weekendAnalysis" title={titles.weekendAnalysis}>
            <div className="glass p-5 h-full">
              <h2 className="font-semibold text-[var(--content-primary)] mb-3 text-sm">Weekday vs Weekend</h2>
              <WeekendAnalysis
                weekday={weekendAnalysisData.weekday}
                weekend={weekendAnalysisData.weekend}
              />
            </div>
          </Panel>
          <Panel id="twoWeekComparison" title={titles.twoWeekComparison}>
            <div className="glass p-5 h-full">
              <h2
                className="font-semibold text-[var(--content-primary)] mb-3 text-sm"
                title="Body responds ~2 weeks delayed — rolling 14-day windows show real change"
              >
                Last 2 Weeks vs Prior 2
              </h2>
              <ProgressComparison
                thisWeek={progressComparisonData.thisWeek}
                lastWeek={progressComparisonData.lastWeek}
              />
            </div>
          </Panel>
        </div>
      )}
    </div>
  );
}
