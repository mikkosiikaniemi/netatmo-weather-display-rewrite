import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Line, LineChart, ReferenceDot, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useForecastData } from '../hooks/useForecastData'
import { useSensorReadings } from '../hooks/useSensorReadings'
import { useWeatherData } from '../hooks/useWeatherData'
import { useStationHistory } from '../hooks/useStationHistory'
import { SensorReadingCard, groupReadingsByDevice } from './SensorReadingsWidget'
import { ForecastPoint, ModuleHistory, StationHistoryResponse } from '../types/weather'

const QUERY_REFETCH_INTERVAL_MS = 10.5 * 60 * 1000

const ACCENT_COLOR = '#6ba3e0'
const TEMP_COLOR = '#ff3b30'
const HUMIDITY_COLOR = '#00b8ff'
const FORECAST_RAIN_COLOR = 'hsla(197, 100%, 60%, 0.98)'
const FORECAST_DAYS_TO_SHOW = 3
const FORECAST_MAX_POINTS = 20
const FORECAST_TIME_ZONE = 'Europe/Helsinki'

const YR_SYMBOL_ID_BY_CODE: Record<string, string> = {
  clearsky_day: '01d',
  clearsky_night: '01n',
  clearsky_polartwilight: '01m',
  fair_day: '02d',
  fair_night: '02n',
  fair_polartwilight: '02m',
  partlycloudy_day: '03d',
  partlycloudy_night: '03n',
  partlycloudy_polartwilight: '03m',
  cloudy: '04',
  rainshowers_day: '05d',
  rainshowers_night: '05n',
  rainshowers_polartwilight: '05m',
  rainshowersandthunder_day: '06d',
  rainshowersandthunder_night: '06n',
  rainshowersandthunder_polartwilight: '06m',
  sleetshowers_day: '07d',
  sleetshowers_night: '07n',
  sleetshowers_polartwilight: '07m',
  snowshowers_day: '08d',
  snowshowers_night: '08n',
  snowshowers_polartwilight: '08m',
  rain: '09',
  heavyrain: '10',
  heavyrainandthunder: '11',
  sleet: '12',
  snow: '13',
  snowandthunder: '14',
  fog: '15',
  sleetshowersandthunder_day: '20d',
  sleetshowersandthunder_night: '20n',
  sleetshowersandthunder_polartwilight: '20m',
  snowshowersandthunder_day: '21d',
  snowshowersandthunder_night: '21n',
  snowshowersandthunder_polartwilight: '21m',
  rainandthunder: '22',
  sleetandthunder: '23',
  lightrainshowersandthunder_day: '24d',
  lightrainshowersandthunder_night: '24n',
  lightrainshowersandthunder_polartwilight: '24m',
  heavyrainshowersandthunder_day: '25d',
  heavyrainshowersandthunder_night: '25n',
  heavyrainshowersandthunder_polartwilight: '25m',
  lightssleetshowersandthunder_day: '26d',
  lightssleetshowersandthunder_night: '26n',
  lightssleetshowersandthunder_polartwilight: '26m',
  lightsleetshowersandthunder_day: '26d',
  lightsleetshowersandthunder_night: '26n',
  lightsleetshowersandthunder_polartwilight: '26m',
  heavysleetshowersandthunder_day: '27d',
  heavysleetshowersandthunder_night: '27n',
  heavysleetshowersandthunder_polartwilight: '27m',
  lightssnowshowersandthunder_day: '28d',
  lightssnowshowersandthunder_night: '28n',
  lightssnowshowersandthunder_polartwilight: '28m',
  lightsnowshowersandthunder_day: '28d',
  lightsnowshowersandthunder_night: '28n',
  lightsnowshowersandthunder_polartwilight: '28m',
  heavysnowshowersandthunder_day: '29d',
  heavysnowshowersandthunder_night: '29n',
  heavysnowshowersandthunder_polartwilight: '29m',
  lightrainandthunder: '30',
  lightsleetandthunder: '31',
  heavysleetandthunder: '32',
  lightsnowandthunder: '33',
  heavysnowandthunder: '34',
  lightrainshowers_day: '40d',
  lightrainshowers_night: '40n',
  lightrainshowers_polartwilight: '40m',
  heavyrainshowers_day: '41d',
  heavyrainshowers_night: '41n',
  heavyrainshowers_polartwilight: '41m',
  lightsleetshowers_day: '42d',
  lightsleetshowers_night: '42n',
  lightsleetshowers_polartwilight: '42m',
  heavysleetshowers_day: '43d',
  heavysleetshowers_night: '43n',
  heavysleetshowers_polartwilight: '43m',
  lightsnowshowers_day: '44d',
  lightsnowshowers_night: '44n',
  lightsnowshowers_polartwilight: '44m',
  heavysnowshowers_day: '45d',
  heavysnowshowers_night: '45n',
  heavysnowshowers_polartwilight: '45m',
  lightrain: '46',
  lightsleet: '47',
  heavysleet: '48',
  lightsnow: '49',
  heavysnow: '50',
}

interface DashboardProps {
  authStatus: {
    user: null | {
      scope: string | null
      expiresAt: number | null
    }
  }
  onLogout: () => void
}

interface DashboardHeaderProps {
  onRefresh: () => void
  onLogout: () => void
  stationLatitude: number | null
  stationLongitude: number | null
  overviewFetchedAt: string | null
  historyFetchedAt: string | null
}

const DashboardHeader = React.memo(function DashboardHeader(props: DashboardHeaderProps) {
  const [now, setNow] = useState<Date>(new Date())
  const [isMetaOpen, setIsMetaOpen] = useState(false)

  const sunTimes = useMemo(() => {
    if (props.stationLatitude === null || props.stationLongitude === null) {
      return null
    }

    return calculateSunTimes(now, props.stationLatitude, props.stationLongitude)
  }, [now, props.stationLatitude, props.stationLongitude])

  const nextOverviewFetchAt = useMemo(() => getNextFetchAt(props.overviewFetchedAt), [props.overviewFetchedAt])
  const nextHistoryFetchAt = useMemo(() => getNextFetchAt(props.historyFetchedAt), [props.historyFetchedAt])

  useEffect(() => {
    const timer = setInterval(() => {
      setNow(new Date())
    }, 1000)

    return () => clearInterval(timer)
  }, [])

  return (
    <section>
      <div className="grid gap-4 grid-cols-[auto_auto_auto] items-center">
        <p className="text-[26px] text-[#9a9892]">{formatDate(now)}</p>
        <div className="relative flex items-center gap-2 justify-center self-center">
          <button
            onClick={props.onRefresh}
            className="inline-flex h-9 w-9 items-center justify-center rounded-md text-[#4a4b4c] transition-colors hover:bg-white/10 hover:text-zinc-200"
            type="button"
            aria-label="Refresh data"
            title="Refresh data"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M21 12a9 9 0 1 1-2.64-6.36" />
              <path d="M21 3v6h-6" />
            </svg>
          </button>
          <button
            onClick={props.onLogout}
            className="inline-flex h-9 w-9 items-center justify-center rounded-md text-[#4a4b4c] transition-colors hover:bg-white/10 hover:text-zinc-200"
            type="button"
            aria-label="Disconnect"
            title="Disconnect"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 2v10" />
              <path d="M18.36 5.64a9 9 0 1 1-12.72 0" />
            </svg>
          </button>
          <button
            onClick={() => setIsMetaOpen((previousValue) => !previousValue)}
            className="inline-flex h-9 w-9 items-center justify-center rounded-md text-[#4a4b4c] transition-colors hover:bg-white/10 hover:text-zinc-200"
            type="button"
            aria-label="Show info"
            aria-expanded={isMetaOpen}
            title="Show info"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="9" />
              <path d="M12 10v6" />
              <path d="M12 7.25h.01" />
            </svg>
          </button>
          {isMetaOpen ? (
            <div className="absolute right-0 top-full z-20 mt-2 w-[min(92vw,22rem)] rounded-lg border border-zinc-700 bg-zinc-950 p-3 text-sm text-zinc-200 shadow-xl backdrop-blur">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">Info</p>
              <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
                <span className="text-zinc-400">Sunrise</span>
                <span className="justify-self-end tabular-nums">{sunTimes ? formatClock(sunTimes.sunrise) : '--:--:--'}</span>
                <span className="text-zinc-400">Sunset</span>
                <span className="justify-self-end tabular-nums">{sunTimes ? formatClock(sunTimes.sunset) : '--:--:--'}</span>
                <span className="text-zinc-400">Overview fetched</span>
                <span className="justify-self-end tabular-nums">{props.overviewFetchedAt ? formatFetchedAt(props.overviewFetchedAt) : '--:--:--'}</span>
                <span className="text-zinc-400">Overview next</span>
                <span className="justify-self-end tabular-nums">{nextOverviewFetchAt ? formatDateTime(nextOverviewFetchAt) : '--:--:--'}</span>
                <span className="text-zinc-400">History fetched</span>
                <span className="justify-self-end tabular-nums">{props.historyFetchedAt ? formatFetchedAt(props.historyFetchedAt) : '--:--:--'}</span>
                <span className="text-zinc-400">History next</span>
                <span className="justify-self-end tabular-nums">{nextHistoryFetchAt ? formatDateTime(nextHistoryFetchAt) : '--:--:--'}</span>
              </div>
            </div>
          ) : null}
        </div>
        <p className="text-[26px] text-[#9a9892] justify-self-end md:text-right">{formatShortClock(now)}</p>
      </div>
    </section>
  )
})

function Dashboard(props: DashboardProps) {
  const weatherQuery = useWeatherData()
  const forecastQuery = useForecastData()
  const sensorQuery = useSensorReadings()
  const handleRefresh = () => {
    void Promise.all([
      weatherQuery.refetch(),
      forecastQuery.refetch(),
      sensorQuery.refetch(),
    ])
  }
  const sensorDevices = useMemo(
    () => groupReadingsByDevice(sensorQuery.data ? sensorQuery.data.readings : []),
    [sensorQuery.data]
  )
  const stations = weatherQuery.data ? weatherQuery.data.stations : []
  const selectedStation = stations.length > 0 ? stations[0] : null
  const selectedStationId = selectedStation ? selectedStation.id : null
  const historyQuery = useStationHistory(selectedStationId)
  const moduleHistoryCacheByStationRef = useRef<Record<string, Record<string, ModuleHistory>>>({})

  useEffect(() => {
    if (!historyQuery.data) {
      return
    }

    const stationId = historyQuery.data.stationId
    const stationCache = moduleHistoryCacheByStationRef.current[stationId] || {}

    historyQuery.data.modules.forEach((module) => {
      if (moduleHasRenderableHistory(module)) {
        stationCache[module.moduleId] = module
      }
    })

    moduleHistoryCacheByStationRef.current[stationId] = stationCache
  }, [historyQuery.data])

  const effectiveHistoryData = useMemo<StationHistoryResponse | null>(() => {
    if (!historyQuery.data) {
      return null
    }

    const stationCache = moduleHistoryCacheByStationRef.current[historyQuery.data.stationId] || {}
    const modulesById: Record<string, ModuleHistory> = {}

    historyQuery.data.modules.forEach((module) => {
      modulesById[module.moduleId] = module
    })

    historyQuery.data.failedModuleIds.forEach((moduleId) => {
      if (!modulesById[moduleId] && stationCache[moduleId]) {
        modulesById[moduleId] = {
          ...stationCache[moduleId],
          historyFetchFailed: true,
        }
      }
    })

    return {
      ...historyQuery.data,
      modules: Object.values(modulesById),
    }
  }, [historyQuery.data])

  const stationModules = selectedStation ? selectedStation.modules : []
  const outdoorModule = stationModules.find((module) => module.type === 'outdoor') || null
  const indoorModules = stationModules.filter((module) => module.type === 'indoor')
  const failedHistoryModuleIds = useMemo(
    () => new Set(effectiveHistoryData ? effectiveHistoryData.failedModuleIds : []),
    [effectiveHistoryData]
  )
  const outdoorHistory = effectiveHistoryData
    ? effectiveHistoryData.modules.find((module) => module.moduleId === (outdoorModule ? outdoorModule.id : '')) || null
    : null
  const outdoorHasCachedData = Boolean(outdoorHistory && moduleHasRenderableHistory(outdoorHistory))
  const outdoorHistoryFetchFailed = Boolean(
    outdoorModule && (failedHistoryModuleIds.has(outdoorModule.id) || (outdoorHistory && outdoorHistory.historyFetchFailed))
  )
  const indoorHistoryById = useMemo(() => {
    const map: Record<string, ModuleHistory> = {}

    if (!effectiveHistoryData) {
      return map
    }

    effectiveHistoryData.modules.forEach((module) => {
      map[module.moduleId] = module
    })

    return map
  }, [effectiveHistoryData])
  const indoorSeriesById = useMemo(() => {
    const map: Record<string, ReturnType<typeof mergeIndoorSeries>> = {}

    Object.values(indoorHistoryById).forEach((moduleHistory) => {
      map[moduleHistory.moduleId] = mergeIndoorSeries(moduleHistory)
    })

    return map
  }, [indoorHistoryById])
  const indoorPreviousDaySeriesById = useMemo(() => {
    const map: Record<string, ReturnType<typeof mapPreviousDayTemperatureSeries>> = {}

    Object.values(indoorHistoryById).forEach((moduleHistory) => {
      map[moduleHistory.moduleId] = mapPreviousDayTemperatureSeries(moduleHistory)
    })

    return map
  }, [indoorHistoryById])

  const outdoorChartData = useMemo(() => {
    if (!outdoorHistory) {
      return []
    }

    return mergeOutdoorSeries(outdoorHistory)
  }, [outdoorHistory])
  const outdoorTemperatureColorData = useMemo(
    () => splitOutdoorTemperaturesAtZero(outdoorChartData),
    [outdoorChartData]
  )
  const outdoorPreviousDayChartData = useMemo(() => {
    if (!outdoorHistory) {
      return []
    }

    return mapPreviousDayTemperatureSeries(outdoorHistory)
  }, [outdoorHistory])
  const outdoorTemperatureDomain = useMemo(() => {
    const chartTemperatureValues = outdoorChartData
      .map((point) => point.temperature)
      .concat(outdoorPreviousDayChartData.map((point) => point.temperature))
      .filter((value): value is number => typeof value === 'number' && Number.isFinite(value))

    const values = chartTemperatureValues
      .concat([
        outdoorModule ? outdoorModule.temperature : null,
        outdoorModule ? outdoorModule.minTemperature : null,
        outdoorModule ? outdoorModule.maxTemperature : null,
      ])
      .filter((value): value is number => typeof value === 'number' && Number.isFinite(value))

    if (values.length === 0) {
      return ['auto', 'auto'] as ['auto', 'auto']
    }

    const minValue = Math.min(...values)
    const maxValue = Math.max(...values)
    const spread = maxValue - minValue
    const padding = spread > 0 ? Math.max(0.8, spread * 0.1) : 1
    const hasSubZeroTemperature = chartTemperatureValues.some((value) => value < 0)
    const domainMin = hasSubZeroTemperature
      ? Math.floor((minValue - padding) * 2) / 2
      : 0

    return [
      domainMin,
      Math.ceil((maxValue + padding) * 2) / 2,
    ] as [number, number]
  }, [outdoorChartData, outdoorModule, outdoorPreviousDayChartData])
  const outdoorRainAxisMax = useMemo(() => {
    const maxRainValue = outdoorChartData.reduce((maxValue, point) => {
      const rainValue = typeof point.rain === 'number' ? point.rain : 0
      return Math.max(maxValue, rainValue)
    }, 0)

    return Math.max(3, Math.ceil(maxRainValue * 2) / 2)
  }, [outdoorChartData])
  const outdoorRainTodayAmount = useMemo(() => {
    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)
    const todayStartTimestamp = todayStart.getTime()
    const tomorrowStartTimestamp = todayStartTimestamp + 24 * 60 * 60 * 1000

    return outdoorChartData.reduce((sum, point) => {
      if (point.timestamp < todayStartTimestamp || point.timestamp >= tomorrowStartTimestamp) {
        return sum
      }

      const rainValue = typeof point.rain === 'number' ? point.rain : 0
      return sum + Math.max(0, rainValue)
    }, 0)
  }, [outdoorChartData])
  const hasOutdoorRainToday = outdoorRainTodayAmount > 0
  const outdoorTemperatureTicks = useMemo(
    () => buildTemperatureTicks(outdoorTemperatureDomain, 5),
    [outdoorTemperatureDomain]
  )

  const dayWindow = useMemo(() => getDayWindow(new Date()), [weatherQuery.data, historyQuery.data])
  const evenHourTicks = useMemo(() => buildEvenHourTicks(dayWindow.start, dayWindow.end), [dayWindow])
  const indoorTemperatureDomain = useMemo(
    () => getSharedIndoorTemperatureDomain(indoorModules, indoorHistoryById),
    [indoorHistoryById, indoorModules]
  )
  const indoorTemperatureTicks = useMemo(
    () => buildTemperatureTicks(indoorTemperatureDomain, 2),
    [indoorTemperatureDomain]
  )
  const indoorHumidityDomain = useMemo(
    () => getSharedIndoorHumidityDomain(indoorModules, indoorHistoryById),
    [indoorHistoryById, indoorModules]
  )
  const forecastDayGroups = useMemo(() => {
    const groups: Array<{ dayStartTimestamp: number; points: NonNullable<typeof forecastQuery.data>['hourly'] }> = []
    const forecastPoints = forecastQuery.data
      ? applyLegacyForecastScopeRendering(forecastQuery.data.hourly, Date.now(), FORECAST_TIME_ZONE)
      : []

    forecastPoints.forEach((point) => {
      const dayStart = new Date(point.timestamp)
      dayStart.setHours(0, 0, 0, 0)
      const dayStartTimestamp = dayStart.getTime()
      const previousGroup = groups.length > 0 ? groups[groups.length - 1] : null

      if (!previousGroup || previousGroup.dayStartTimestamp !== dayStartTimestamp) {
        groups.push({ dayStartTimestamp, points: [point] })
        return
      }

      previousGroup.points.push(point)
    })

    const compactedGroups = groups
      .slice(0, FORECAST_DAYS_TO_SHOW)
      .map((group) => ({
        dayStartTimestamp: group.dayStartTimestamp,
        points: group.points,
      }))

    return capForecastGroupsToPointLimit(compactedGroups, FORECAST_MAX_POINTS)
  }, [forecastQuery.data])
  const indoorGridStyle = useMemo(
    () => ({ ['--indoor-modules-count' as string]: String(Math.max(indoorModules.length + sensorDevices.length, 1)) }) as React.CSSProperties,
    [indoorModules.length, sensorDevices.length]
  )
  const forecastCells = forecastDayGroups.flatMap((group) => group.points).slice(0, 6)
  const longTermForecast = useMemo(
    () => buildLongTermForecast(forecastQuery.data ? forecastQuery.data.hourly : [], new Date(), FORECAST_TIME_ZONE),
    [forecastQuery.data]
  )
  const sixHourTicks = [0, 6, 12, 18, 24].map((hour) => dayWindow.start + hour * 60 * 60 * 1000)
  const lastOutdoorPoint = [...outdoorChartData].reverse().find((point) => typeof point.temperature === 'number') || null
  const indoorCards = [
    ...indoorModules.map((module) => ({ id: module.id, name: module.name, temperature: module.temperature, humidity: module.humidity })),
    ...sensorDevices.map((device) => ({
      id: device.deviceId,
      name: device.name || device.deviceId,
      temperature: device.latest ? device.latest.temperature : null,
      humidity: device.latest ? device.latest.humidity : null,
    })),
  ]

  return (
    <div className="min-h-screen bg-[#101214] text-[#efece6]">
      <div className="mx-auto w-full max-w-[1100px] px-6 py-7 md:px-[50px]">
        <DashboardHeader
          onRefresh={handleRefresh}
          onLogout={props.onLogout}
          stationLatitude={selectedStation ? selectedStation.latitude : null}
          stationLongitude={selectedStation ? selectedStation.longitude : null}
          overviewFetchedAt={weatherQuery.data ? weatherQuery.data.fetchedAt : null}
          historyFetchedAt={historyQuery.data ? historyQuery.data.fetchedAt : null}
        />

        <section className="mt-9 grid grid-cols-1 gap-8 md:grid-cols-[1fr_1.2fr] md:gap-16">
          {outdoorModule ? (
            <>
              <div className="flex flex-col">
                <p className="flex items-center gap-2 text-[17px] text-[#9a9892]" title={'Last seen: ' + formatLastSeen(outdoorModule.lastSeenAt)}>
                  {outdoorModule.name}
                  {outdoorHistoryFetchFailed ? (
                    <HistoryWarningIcon
                      message={
                        outdoorHasCachedData
                          ? 'Outdoor history fetch failed. Showing last cached values.'
                          : 'Outdoor history fetch failed. No cached outdoor history is available yet.'
                      }
                    />
                  ) : null}
                </p>
                <p className="mt-2 text-[clamp(9rem,21vw,15rem)] font-light leading-[0.95] text-[#efece6]">
                  <BigTemperature value={outdoorModule.temperature} />
                </p>
                <p className="mt-4 flex flex-wrap gap-x-8 gap-y-1 text-[17px] text-[#9a9892]">
                  <span>Alin {formatPlainTemperature(outdoorModule.minTemperature)}</span>
                  <span>Ylin {formatPlainTemperature(outdoorModule.maxTemperature)}</span>
                  <span>Kosteus {outdoorModule.humidity !== null ? outdoorModule.humidity + ' %' : '--'}</span>
                  {hasOutdoorRainToday ? <span className="text-[#6ba3e0]">{outdoorRainTodayAmount.toFixed(1)} mm</span> : null}
                </p>
              </div>

              <div className="h-56 self-end md:h-60">
                {outdoorChartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%" debounce={120}>
                    <LineChart data={outdoorChartData} margin={{ top: 20, right: 0, bottom: 0, left: 0 }}>
                      <XAxis
                        type="number"
                        dataKey="timestamp"
                        domain={[dayWindow.start, dayWindow.end]}
                        allowDataOverflow
                        ticks={sixHourTicks}
                        tickFormatter={formatHourTick}
                        interval={0}
                        tickLine={false}
                        axisLine={false}
                        tickMargin={14}
                        tick={{ fontSize: 12, fill: '#6f6e6a' }}
                        padding={{ left: 0, right: 0 }}
                      />
                      <YAxis hide domain={outdoorTemperatureDomain} />
                      <ReferenceLine y={0} stroke="rgba(255,255,255,0.08)" />
                      <Tooltip content={<OutdoorChartTooltip />} />
                      <Line type="monotone" dataKey="temperature" stroke={ACCENT_COLOR} strokeWidth={3} dot={false} isAnimationActive={false} />
                      {lastOutdoorPoint ? (
                        <ReferenceDot x={lastOutdoorPoint.timestamp} y={lastOutdoorPoint.temperature as number} r={8} fill={ACCENT_COLOR} stroke="none" />
                      ) : null}
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="text-sm text-[#6f6e6a]">
                    {historyQuery.isLoading ? 'Loading outdoor history...' : 'Outdoor history not available yet.'}
                  </p>
                )}
              </div>
            </>
          ) : (
            <p className="text-[#9a9892]">Outdoor module not found.</p>
          )}
        </section>

        <hr className="my-7 border-0 border-t border-white/[0.06]" />

        <section className="grid grid-cols-2 gap-x-6 gap-y-8 md:grid-cols-4">
          {indoorCards.map((card) => (
            <div key={card.id} className="text-center">
              <p className="text-[17px] text-[#9a9892]">{card.name}</p>
              <p className="mt-4 text-[clamp(4rem,8vw,6rem)] font-light leading-none">
                <TemperatureReading value={card.temperature} />
              </p>
              <p className="mt-4 text-[17px] text-[#6f6e6a]">{card.humidity !== null ? Math.round(card.humidity) + ' %' : '--'}</p>
            </div>
          ))}
        </section>

        <hr className="my-7 border-0 border-t border-white/[0.06]" />

        <section>
          {forecastQuery.isLoading ? <p className="text-[#6f6e6a]">Loading forecast...</p> : null}
          {forecastQuery.isError ? <p className="text-rose-300">Forecast unavailable right now.</p> : null}
          <div className="grid grid-cols-3 gap-x-6 gap-y-8 md:grid-cols-6">
            {forecastCells.map((point) => {
              const precipitationAmount = Math.max(0, point.precipitationAmount)

              return (
                <div key={point.timestamp} className="text-center">
                  <p className="text-[17px] text-[#9a9892]">{formatWeekdayShort(point.timestamp)} {formatHour(point.timestamp)}</p>
                  <div className={'mt-4 flex justify-center ' + (precipitationAmount > 0 ? 'text-[#6ba3e0]' : 'text-[#9a9892]')}>
                    <ForecastIcon symbolCode={point.symbolCode} />
                  </div>
                  <p className="mt-4 text-[34px] font-light leading-none tracking-[-0.02em]">
                    {formatPlainTemperature(point.airTemperature, 0)}
                  </p>
                  {precipitationAmount > 0 ? (
                    <p className="mt-2 text-[17px] text-[#6ba3e0]">{precipitationAmount.toFixed(1)} mm</p>
                  ) : null}
                </div>
              )
            })}
          </div>

          {longTermForecast.length > 0 ? (
            <div className="mt-8 overflow-x-auto border-t border-white/[0.06] pt-6">
              <div className="long-term-forecast">
                {longTermForecast.map((day) => (
                  <div className="flex min-w-0 flex-col items-center gap-1.5 text-center" key={day.dateKey}>
                    <p className="text-xs tabular-nums text-[#777772]">{day.dayNumber}</p>
                    <div className="text-[#a3a29c]">
                      <ForecastIcon symbolCode={day.symbolCode} size={24} />
                    </div>
                    <p className="long-term-forecast__temperatures text-[11px] tabular-nums text-[#a3a29c]">
                      <span>{formatPlainTemperature(day.highTemperature, 0)}</span>
                      <span className="long-term-forecast__temperature-separator text-white/30">·</span>
                      <span>{formatPlainTemperature(day.lowTemperature, 0)}</span>
                    </p>
                    {day.precipitationAmount > 0 ? (
                      <p className="text-[11px] tabular-nums text-[#6ba3e0]">{day.precipitationAmount.toFixed(1)} mm</p>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </section>
      </div>
    </div>
  )
}

function BigTemperature(props: { value: number | null }) {
  if (props.value === null) {
    return <span>--</span>
  }

  const [mainDigits, fractionalDigit = '0'] = props.value.toFixed(1).replace('-', '\u2212').split('.')

  return (
    <span className="inline-flex items-baseline">
      {mainDigits}
      <span className="ml-[0.14em] text-[0.5em] tracking-wide opacity-45">{fractionalDigit}°</span>
    </span>
  )
}

function formatPlainTemperature(value: number | null, digits: number = 1) {
  if (value === null || value === undefined) {
    return '--'
  }

  const rounded = digits === 0 ? Math.round(value) : Number(value.toFixed(digits))

  return String(digits === 0 ? rounded : rounded.toFixed(digits)).replace('-', '\u2212') + '°'
}

function ForecastIcon(props: { symbolCode: string; size?: number }) {
  const code = props.symbolCode || ''
  const isNight = code.endsWith('_night')
  const isClear = code.startsWith('clearsky') || code.startsWith('fair')
  const hasRain = /rain|sleet|thunder/.test(code)
  const hasSnow = /snow/.test(code)
  const svgProps = {
    viewBox: '0 0 24 24',
    width: props.size || 38,
    height: props.size || 38,
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.3,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-label': code.replace(/_/g, ' '),
  }

  if (isClear && isNight) {
    return (
      <svg {...svgProps}>
        <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" />
      </svg>
    )
  }

  if (isClear) {
    return (
      <svg {...svgProps}>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4" />
      </svg>
    )
  }

  return (
    <svg {...svgProps}>
      <path d="M7 15a4 4 0 0 1-.5-7.97A5.5 5.5 0 0 1 17 7.5a3.75 3.75 0 0 1 .5 7.5H7Z" />
      {hasRain ? <path d="M9 18l-.6 2M12.5 18l-.6 2M16 18l-.6 2" /> : null}
      {hasSnow && !hasRain ? <path d="M9 18.5h.01M12.5 19.5h.01M16 18.5h.01" strokeWidth={2} /> : null}
    </svg>
  )
}

function buildLongTermForecast(points: ForecastPoint[], referenceDate: Date, timeZone: string) {
  const today = getZonedDateParts(referenceDate, timeZone)
  const todayKey = [today.year, String(today.month).padStart(2, '0'), String(today.day).padStart(2, '0')].join('-')
  const groupedPoints = new Map<string, ForecastPoint[]>()

  points.forEach((point) => {
    const dateParts = getZonedDateParts(new Date(point.timestamp), timeZone)
    const dateKey = [dateParts.year, String(dateParts.month).padStart(2, '0'), String(dateParts.day).padStart(2, '0')].join('-')

    if (dateKey <= todayKey) {
      return
    }

    const dayPoints = groupedPoints.get(dateKey) || []
    dayPoints.push(point)
    groupedPoints.set(dateKey, dayPoints)
  })

  return Array.from(groupedPoints.entries())
    .sort(([dateA], [dateB]) => dateA.localeCompare(dateB))
    .slice(0, 9)
    .map(([dateKey, dayPoints]) => {
      const middayPoint = dayPoints.reduce((closest, point) => {
        const pointHour = getZonedDateParts(new Date(point.timestamp), timeZone, true).hour
        const closestHour = getZonedDateParts(new Date(closest.timestamp), timeZone, true).hour
        return Math.abs(pointHour - 12) < Math.abs(closestHour - 12) ? point : closest
      }, dayPoints[0])
      const dayNumber = Number(dateKey.slice(-2))

      return {
        dateKey,
        dayNumber,
        symbolCode: middayPoint.symbolCode,
        precipitationAmount: dayPoints.reduce((total, point) => total + Math.max(0, point.precipitationAmount), 0),
        highTemperature: Math.max(...dayPoints.map((point) => point.airTemperature)),
        lowTemperature: Math.min(...dayPoints.map((point) => point.airTemperature)),
      }
    })
}

function formatDate(value: Date) {
  const weekday = value.toLocaleDateString('fi-FI', { weekday: 'long' })
  const capitalizedWeekday = weekday.charAt(0).toUpperCase() + weekday.slice(1)
  const day = value.getDate()
  const month = value.getMonth() + 1

  return `${capitalizedWeekday} ${day}.${month}.`
}

function TemperatureReading(props: { value: number | null }) {
  if (props.value === null) {
    return <span>--</span>
  }

  const [mainDigits, fractionalDigit = '0'] = props.value.toFixed(1).replace('-', '\u2212').split('.')

  return (
    <span className="inline-flex items-baseline">
      {mainDigits}
      <span className="ml-[0.14em] text-[0.55em] tracking-wide opacity-45">{fractionalDigit}°</span>
    </span>
  )
}

function resolveYrSymbolId(symbolCode: string) {
  const cleanCode = (symbolCode || '').trim()

  if (/^(0[1-9]|[1-4][0-9]|50)(d|n|m)?$/.test(cleanCode)) {
    return cleanCode
  }

  const mapped = YR_SYMBOL_ID_BY_CODE[cleanCode]

  return mapped || '04'
}

function formatShortClock(value: Date) {
  return value.toLocaleTimeString('fi-FI', { hour: '2-digit', minute: '2-digit' })
}

function formatClock(value: Date) {
  return value.toLocaleTimeString('fi-FI', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

function formatHour(timestamp: number) {
  return String(new Date(timestamp).getHours()).padStart(2, '0')
}

function formatHourTick(timestamp: number) {
  return String(new Date(timestamp).getHours()).padStart(2, '0')
}

function formatWeekdayShort(timestamp: number) {
  const shortWeekday = new Date(timestamp).toLocaleDateString('fi-FI', {
    weekday: 'short',
  }).replace('.', '')

  return shortWeekday.charAt(0).toUpperCase() + shortWeekday.slice(1)
}

function isSameCalendarDay(timestampA: number, timestampB: number) {
  const firstDate = new Date(timestampA)
  const secondDate = new Date(timestampB)

  return (
    firstDate.getFullYear() === secondDate.getFullYear()
    && firstDate.getMonth() === secondDate.getMonth()
    && firstDate.getDate() === secondDate.getDate()
  )
}

function formatTooltipTimestamp(value: number | string) {
  const numericValue = typeof value === 'number' ? value : Number(value)

  if (!Number.isFinite(numericValue)) {
    return String(value)
  }

  return new Date(numericValue).toLocaleTimeString('fi-FI', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatFetchedAt(value: string) {
  return new Date(value).toLocaleTimeString('fi-FI', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

function formatLastSeen(value: number | null) {
  if (value === null) {
    return '--:--:--'
  }

  return new Date(value * 1000).toLocaleTimeString('fi-FI', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

function formatDateTime(value: Date) {
  return value.toLocaleTimeString('fi-FI', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

function getNextFetchAt(fetchedAt: string | null) {
  if (!fetchedAt) {
    return null
  }

  return new Date(new Date(fetchedAt).getTime() + QUERY_REFETCH_INTERVAL_MS)
}

function getCo2Class(co2: number | null) {
  if (co2 === null) {
    return 'bg-slate-500'
  }

  if (co2 > 2000) {
    return 'bg-red-500'
  }

  if (co2 > 1500) {
    return 'bg-orange-500'
  }

  if (co2 > 1000) {
    return 'bg-amber-400'
  }

  if (co2 > 700) {
    return 'bg-lime-400'
  }

  return 'bg-emerald-500'
}

function HistoryWarningIcon(props: { message: string }) {
  return (
    <span className="inline-flex h-5 w-5 items-center justify-center text-amber-300" title={props.message} aria-label={props.message}>
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 3.5 3.7 19a1 1 0 0 0 .88 1.5h14.84a1 1 0 0 0 .88-1.5L12 3.5Z" />
        <path d="M12 9v5" />
        <circle cx="12" cy="17" r="1" fill="currentColor" stroke="none" />
      </svg>
    </span>
  )
}

function mergeOutdoorSeries(module: ModuleHistory) {
  const earlierTemperatureByTimestamp = new Map(
    module.earlierTemperatures.map((point) => [point.timestamp, point.value] as const)
  )
  const halfHourMs = 30 * 60 * 1000
  const rainByHalfHour = new Map<number, number>()
  const seenRainHalfHours = new Set<number>()

  module.rain.forEach((point) => {
    if (typeof point.value !== 'number') {
      return
    }

    const halfHourTimestamp = Math.floor(point.timestamp / halfHourMs) * halfHourMs
    rainByHalfHour.set(halfHourTimestamp, (rainByHalfHour.get(halfHourTimestamp) || 0) + Math.max(0, point.value))
  })

  return module.recentTemperatures.map((point, index) => {
    const halfHourTimestamp = Math.floor(point.timestamp / halfHourMs) * halfHourMs
    const isFirstPointInHalfHour = !seenRainHalfHours.has(halfHourTimestamp)
    const rainValue = rainByHalfHour.get(halfHourTimestamp) ?? 0

    if (isFirstPointInHalfHour) {
      seenRainHalfHours.add(halfHourTimestamp)
    }

    return {
      timestamp: point.timestamp,
      temperature: point.value,
      previousDayTemperature:
        earlierTemperatureByTimestamp.has(point.timestamp)
          ? earlierTemperatureByTimestamp.get(point.timestamp) ?? null
          : module.earlierTemperatures[index]
          ? module.earlierTemperatures[index].value
          : null,
      humidity: module.humidity[index] ? module.humidity[index].value : null,
      rain: isFirstPointInHalfHour ? rainValue : 0,
    }
  })
}

function splitOutdoorTemperaturesAtZero(
  points: ReturnType<typeof mergeOutdoorSeries>
) {
  const result: Array<
    (typeof points)[number] & {
      temperatureAboveZero: number | null
      temperatureBelowZero: number | null
    }
  > = []

  points.forEach((point, index) => {
    const temperature = point.temperature
    result.push({
      ...point,
      temperatureAboveZero:
        typeof temperature === 'number' && temperature >= 0 ? temperature : null,
      temperatureBelowZero:
        typeof temperature === 'number' && temperature <= 0 ? temperature : null,
    })

    const nextPoint = points[index + 1]
    const nextTemperature = nextPoint ? nextPoint.temperature : null
    if (
      typeof temperature !== 'number' ||
      typeof nextTemperature !== 'number' ||
      temperature === 0 ||
      nextTemperature === 0 ||
      (temperature < 0) === (nextTemperature < 0)
    ) {
      return
    }

    const crossingRatio = -temperature / (nextTemperature - temperature)
    result.push({
      ...point,
      timestamp: point.timestamp + (nextPoint.timestamp - point.timestamp) * crossingRatio,
      temperature: 0,
      temperatureAboveZero: 0,
      temperatureBelowZero: 0,
    })
  })

  return result
}

function OutdoorChartTooltip(props: {
  active?: boolean
  label?: number | string
  payload?: Array<{
    payload?: {
      temperature?: number | null
      humidity?: number | null
      rain?: number | null
      previousDayTemperature?: number | null
    }
  }>
}) {
  if (!props.active || !props.payload || props.payload.length === 0) {
    return null
  }

  const point = props.payload[0] && props.payload[0].payload ? props.payload[0].payload : {}
  const formattedLabel = props.label !== undefined ? formatTooltipTimestamp(props.label) : '--:--'

  return (
    <div className="rounded-lg border border-zinc-600 bg-zinc-900 px-3 py-2 text-xs text-zinc-100 shadow-lg">
      <p className="mb-1 text-zinc-300">{formattedLabel}</p>
      <p>Temperature: {typeof point.temperature === 'number' ? `${point.temperature.toFixed(1)} C` : '--'}</p>
      <p>Humidity: {typeof point.humidity === 'number' ? `${point.humidity.toFixed(0)} %` : '--'}</p>
      <p>Rain: {typeof point.rain === 'number' ? `${point.rain.toFixed(2)} mm` : '--'}</p>
      <p>Temp yesterday: {typeof point.previousDayTemperature === 'number' ? `${point.previousDayTemperature.toFixed(1)} C` : '--'}</p>
    </div>
  )
}

function RainBarShape(props: {
  x?: number
  y?: number
  width?: number
  height?: number
  fill?: string
}) {
  const x = typeof props.x === 'number' ? props.x : 0
  const y = typeof props.y === 'number' ? props.y : 0
  const width = typeof props.width === 'number' ? props.width : 0
  const height = typeof props.height === 'number' ? props.height : 0

  if (height <= 0) {
    return null
  }

  const visualWidth = 5
  const adjustedX = x + (width - visualWidth) / 2

  return (
    <rect
      x={adjustedX}
      y={y}
      width={visualWidth}
      height={height}
      rx={1}
      ry={1}
      fill={props.fill || FORECAST_RAIN_COLOR}
    />
  )
}

function mergeIndoorSeries(module: ModuleHistory) {
  const earlierTemperatureByTimestamp = new Map(
    module.earlierTemperatures.map((point) => [point.timestamp, point.value] as const)
  )

  return module.recentTemperatures.map((point, index) => ({
    timestamp: point.timestamp,
    temperature: point.value,
    previousDayTemperature:
      earlierTemperatureByTimestamp.has(point.timestamp)
        ? earlierTemperatureByTimestamp.get(point.timestamp) ?? null
        : module.earlierTemperatures[index]
        ? module.earlierTemperatures[index].value
        : null,
    humidity: module.humidity[index] ? module.humidity[index].value : null,
  }))
}

function mapPreviousDayTemperatureSeries(module: ModuleHistory) {
  return module.earlierTemperatures.map((point) => ({
    timestamp: point.timestamp,
    temperature: point.value,
  }))
}

function moduleHasRenderableHistory(module: ModuleHistory) {
  return (
    module.recentTemperatures.some((point) => typeof point.value === 'number') ||
    module.earlierTemperatures.some((point) => typeof point.value === 'number') ||
    module.humidity.some((point) => typeof point.value === 'number') ||
    module.rain.some((point) => typeof point.value === 'number')
  )
}

function getSharedIndoorTemperatureDomain(
  indoorModules: Array<{ id: string }>,
  indoorHistoryById: Record<string, ModuleHistory>
): [number, number] | ['auto', 'auto'] {
  const allTemperatures = indoorModules
    .flatMap((module) => {
      const history = indoorHistoryById[module.id]
      return history ? history.recentTemperatures.map((point) => point.value) : []
    })
    .filter((value) => Number.isFinite(value))

  if (allTemperatures.length === 0) {
    return ['auto', 'auto']
  }

  const minValue = Math.min(...allTemperatures)
  const maxValue = Math.max(...allTemperatures)

  return [Math.floor(minValue - 1), Math.ceil(maxValue + 1)]
}

function getSharedIndoorHumidityDomain(
  indoorModules: Array<{ id: string }>,
  indoorHistoryById: Record<string, ModuleHistory>
): [number, number] | ['auto', 'auto'] {
  const allHumidityValues = indoorModules
    .flatMap((module) => {
      const history = indoorHistoryById[module.id]
      return history ? history.humidity.map((point) => point.value) : []
    })
    .filter((value) => Number.isFinite(value))

  if (allHumidityValues.length === 0) {
    return ['auto', 'auto']
  }

  const minValue = Math.min(...allHumidityValues)

  return [minValue, 100]
}

function getDayWindow(reference: Date) {
  const start = new Date(reference)
  start.setHours(0, 0, 0, 0)
  const end = new Date(start)
  end.setDate(end.getDate() + 1)

  return {
    start: start.getTime(),
    end: end.getTime(),
  }
}

function buildEvenHourTicks(start: number, end: number) {
  const ticks: number[] = []
  const twoHoursMs = 2 * 60 * 60 * 1000

  for (let value = start; value <= end; value += twoHoursMs) {
    ticks.push(value)
  }

  return ticks
}

function getRainBarHeightPx(precipitationMaxMm: number) {
  if (precipitationMaxMm <= 0) {
    return 0
  }

  if (precipitationMaxMm <= 1) {
    return 1
  }

  if (precipitationMaxMm >= 20) {
    return 30
  }

  const normalized = (precipitationMaxMm - 1) / 19

  return 1 + normalized * 29
}

function applyLegacyForecastScopeRendering<T extends { timestamp: number }>(
  points: T[],
  nowMs: number,
  timeZone: string
) {
  return points.filter((point) => {
    const scope = getLegacyForecastScope(nowMs, point.timestamp, timeZone)

    if (scope !== 'next_6_hours') {
      return true
    }

    return isLegacySixHourScopeTimestamp(point.timestamp, timeZone)
  })
}

function getLegacyForecastScope(
  nowMs: number,
  datapointTimestampMs: number,
  timeZone: string
): 'next_1_hours' | 'next_6_hours' {
  const todayStartMs = getStartOfDayMsInTimeZone(timeZone, 0, new Date(nowMs))
  const tomorrowStartMs = getStartOfDayMsInTimeZone(timeZone, 1, new Date(nowMs))

  const today09Ms = todayStartMs + 9 * 60 * 60 * 1000
  const today16Ms = todayStartMs + 16 * 60 * 60 * 1000
  const today19Ms = todayStartMs + 19 * 60 * 60 * 1000
  const today21Ms = todayStartMs + 21 * 60 * 60 * 1000
  const tomorrow01Ms = tomorrowStartMs + 1 * 60 * 60 * 1000
  const tomorrow07Ms = tomorrowStartMs + 7 * 60 * 60 * 1000
  const tomorrow08Ms = tomorrowStartMs + 8 * 60 * 60 * 1000
  const tomorrow12Ms = tomorrowStartMs + 12 * 60 * 60 * 1000
  const tomorrow13Ms = tomorrowStartMs + 13 * 60 * 60 * 1000

  if (nowMs < today09Ms) {
    return datapointTimestampMs > today19Ms ? 'next_6_hours' : 'next_1_hours'
  }

  if (nowMs < today16Ms) {
    const isTonightToTomorrowMorning = datapointTimestampMs > today21Ms && datapointTimestampMs < tomorrow07Ms
    const isTomorrowAfternoonOnward = datapointTimestampMs > tomorrow12Ms
    return isTonightToTomorrowMorning || isTomorrowAfternoonOnward ? 'next_6_hours' : 'next_1_hours'
  }

  const isTomorrowNight = datapointTimestampMs > tomorrow01Ms && datapointTimestampMs < tomorrow08Ms
  const isTomorrowAfternoonOnward = datapointTimestampMs > tomorrow13Ms
  return isTomorrowNight || isTomorrowAfternoonOnward ? 'next_6_hours' : 'next_1_hours'
}

function isLegacySixHourScopeTimestamp(timestampMs: number, timeZone: string) {
  const hour = getZonedDateParts(new Date(timestampMs), timeZone, true).hour
  return hour === 0 || hour === 6 || hour === 12 || hour === 18
}

function getStartOfDayMsInTimeZone(timeZone: string, dayOffset: number, referenceDate: Date) {
  const zonedNow = getZonedDateParts(referenceDate, timeZone)
  const nominalUtcMidnightMs = Date.UTC(zonedNow.year, zonedNow.month - 1, zonedNow.day + dayOffset, 0, 0, 0)
  const offsetMinutes = getTimeZoneOffsetMinutes(new Date(nominalUtcMidnightMs), timeZone)
  return nominalUtcMidnightMs - offsetMinutes * 60 * 1000
}

function getTimeZoneOffsetMinutes(date: Date, timeZone: string) {
  const zoned = getZonedDateParts(date, timeZone, true)
  const asUtcMs = Date.UTC(zoned.year, zoned.month - 1, zoned.day, zoned.hour, zoned.minute, zoned.second)
  return Math.round((asUtcMs - date.getTime()) / (60 * 1000))
}

function getZonedDateParts(date: Date, timeZone: string, includeTime: boolean = false) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: includeTime ? '2-digit' : undefined,
    minute: includeTime ? '2-digit' : undefined,
    second: includeTime ? '2-digit' : undefined,
    hour12: false,
  })
  const parts = formatter.formatToParts(date)
  const mapped = parts.reduce((acc, part) => {
    if (part.type !== 'literal') {
      acc[part.type] = part.value
    }
    return acc
  }, {} as Record<string, string>)

  return {
    year: Number(mapped.year || 0),
    month: Number(mapped.month || 1),
    day: Number(mapped.day || 1),
    hour: Number(mapped.hour || 0),
    minute: Number(mapped.minute || 0),
    second: Number(mapped.second || 0),
  }
}

function capForecastGroupsToPointLimit<T>(
  groups: Array<{ dayStartTimestamp: number; points: T[] }>,
  maxPoints: number
) {
  if (maxPoints <= 0) {
    return []
  }

  let remainingPoints = maxPoints

  return groups
    .map((group) => {
      if (remainingPoints <= 0) {
        return null
      }

      const limitedPoints = group.points.slice(0, remainingPoints)
      remainingPoints -= limitedPoints.length

      if (limitedPoints.length === 0) {
        return null
      }

      return {
        dayStartTimestamp: group.dayStartTimestamp,
        points: limitedPoints,
      }
    })
    .filter((group): group is { dayStartTimestamp: number; points: T[] } => Boolean(group))
}

function buildTemperatureTicks(
  domain: [number, number] | ['auto', 'auto'],
  step: number
): number[] | undefined {
  if (domain[0] === 'auto') {
    return undefined
  }

  const [minValue, maxValue] = domain

  if (!Number.isFinite(minValue) || !Number.isFinite(maxValue) || minValue >= maxValue || step <= 0) {
    return undefined
  }

  const firstTick = Math.ceil(minValue / step) * step
  const ticks: number[] = []

  for (let value = firstTick; value <= maxValue; value += step) {
    ticks.push(Number(value.toFixed(4)))
  }

  if (ticks.length === 0 || ticks[0] !== minValue) {
    ticks.unshift(minValue)
  }

  if (ticks[ticks.length - 1] !== maxValue) {
    ticks.push(maxValue)
  }

  return ticks
}

function formatTemperatureTickLabel(
  value: number | string,
  domain: [number, number] | ['auto', 'auto']
) {
  const numericValue = typeof value === 'number' ? value : Number(value)

  if (!Number.isFinite(numericValue)) {
    return String(value)
  }

  if (domain[0] !== 'auto') {
    const [, maxValue] = domain

    if (Math.abs(numericValue - maxValue) < 0.0001) {
      return ''
    }
  }

  return Number.isInteger(numericValue) ? String(numericValue) : numericValue.toFixed(1)
}

function calculateSunTimes(date: Date, latitude: number, longitude: number) {
  const dayMs = 24 * 60 * 60 * 1000
  const rad = Math.PI / 180
  const day = Math.floor((Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) - Date.UTC(2000, 0, 1)) / dayMs)
  const meanAnomaly = 357.5291 + 0.98560028 * day
  const equationOfCenter = 1.9148 * Math.sin(meanAnomaly * rad) + 0.02 * Math.sin(2 * meanAnomaly * rad) + 0.0003 * Math.sin(3 * meanAnomaly * rad)
  const eclipticLongitude = (meanAnomaly + equationOfCenter + 180 + 102.9372) % 360
  const solarTransit = 2451545 + day + 0.0053 * Math.sin(meanAnomaly * rad) - 0.0069 * Math.sin(2 * eclipticLongitude * rad)
  const declination = Math.asin(Math.sin(eclipticLongitude * rad) * Math.sin(23.44 * rad))
  const latRad = latitude * rad
  const hourAngle = Math.acos((Math.sin(-0.83 * rad) - Math.sin(latRad) * Math.sin(declination)) / (Math.cos(latRad) * Math.cos(declination)))

  const sunriseJulian = solarTransit - hourAngle / (2 * Math.PI) - longitude / 360
  const sunsetJulian = solarTransit + hourAngle / (2 * Math.PI) - longitude / 360

  return {
    sunrise: julianToDate(sunriseJulian),
    sunset: julianToDate(sunsetJulian),
  }
}

function julianToDate(julianDate: number) {
  const unixEpochJulian = 2440587.5
  return new Date((julianDate - unixEpochJulian) * 86400000)
}

export default Dashboard
