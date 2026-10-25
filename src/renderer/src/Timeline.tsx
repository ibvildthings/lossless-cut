import type { MutableRefObject, CSSProperties, WheelEventHandler, MouseEventHandler } from 'react';
import { memo, useRef, useMemo, useCallback, useEffect, useState } from 'react';
import { motion, useMotionValue, useSpring } from 'motion/react';
import debounce from 'lodash/debounce';
import { useTranslation } from 'react-i18next';
import { FaCaretDown, FaCaretUp } from 'react-icons/fa';
import invariant from 'tiny-invariant';

import TimelineSeg from './TimelineSeg';
import BetweenSegments from './BetweenSegments';
import useContextMenu from './hooks/useContextMenu';
import useUserSettings from './hooks/useUserSettings';

import styles from './Timeline.module.css';


import { timelineBackground, darkModeTransition } from './colors';
import type { Frame } from './ffmpeg';
import type { FormatTimecode, InverseCutSegment, OverviewWaveform, RenderableWaveform, WaveformSlice, StateSegment, Thumbnail } from './types';
import Button from './components/Button';
import type { UseSegments } from './hooks/useSegments';
import { keyMap } from './timelineWheel';
import { calculateTimelinePercent as calculateTimelinePercent2, calculateTimelinePos } from './util';
import type { TimelineMapping, TimeRange } from './timelineCollapse';
import { createTimelineMapping, getVisibleRanges } from './timelineCollapse';


const currentTimeWidth = 1;
// contrasting outline, so that the cursor/keyframes are visible on top of any segment color, in both light and dark mode #1199
const outlineShadow = '0 0 0 1px var(--gray-1)';

// eslint-disable-next-line react/display-name
const Waveform = memo(({ waveform, mapping, fileDurationNonZero, darkMode }: {
  waveform: RenderableWaveform,
  mapping: TimelineMapping,
  fileDurationNonZero: number,
  darkMode: boolean,
}) => {
  const from = 'from' in waveform ? waveform.from : 0;
  const to = 'to' in waveform ? Math.min(waveform.to, fileDurationNonZero) : fileDurationNonZero;

  // the parts of the waveform that are visible on the (possibly collapsed) timeline
  const pieces = useMemo(() => mapping.ranges.flatMap((range) => {
    const start = Math.max(from, range.start);
    const end = Math.min(to, range.end);
    if (end <= start) return [];
    const length = end - start;
    const outerStyle: CSSProperties = { pointerEvents: 'none', position: 'absolute', height: '100%', overflow: 'hidden', left: `${(mapping.fileToTimeline(start) / mapping.duration) * 100}%`, width: `${(length / mapping.duration) * 100}%` };
    const innerStyle: CSSProperties = { pointerEvents: 'none', position: 'absolute', height: '100%', left: `${-((start - from) / length) * 100}%`, width: `${((to - from) / length) * 100}%`, filter: darkMode ? undefined : 'invert(1)', imageRendering: 'pixelated' };
    return [{ start, outerStyle, innerStyle }];
  }), [darkMode, from, mapping, to]);

  return pieces.map(({ start, outerStyle, innerStyle }) => (
    <div key={start} style={outerStyle}>
      {waveform.url == null ? (
        <div style={innerStyle} className={styles['loading-bg']} />
      ) : (
        <img src={waveform.url} draggable={false} style={innerStyle} alt="" />
      )}
    </div>
  ));
});

// eslint-disable-next-line react/display-name
const Waveforms = memo(({ mapping, fileDurationNonZero, waveforms, overviewWaveform, zoom, darkMode, height }: {
  mapping: TimelineMapping,
  fileDurationNonZero: number,
  waveforms: WaveformSlice[],
  overviewWaveform: OverviewWaveform | undefined,
  zoom: number,
  darkMode: boolean,
  height: number,
}) => (
  <div style={{ height, width: `${zoom * 100}%`, position: 'relative' }}>
    {zoom === 1 && overviewWaveform != null ? (
      <Waveform waveform={overviewWaveform} mapping={mapping} fileDurationNonZero={fileDurationNonZero} darkMode={darkMode} />
    ) : waveforms.map((waveform) => (
      <Waveform key={`${waveform.from}-${waveform.to}`} waveform={waveform} mapping={mapping} fileDurationNonZero={fileDurationNonZero} darkMode={darkMode} />
    ))}
  </div>
));

// eslint-disable-next-line react/display-name
const CommandedTime = memo(({ commandedTimePercent }: { commandedTimePercent: string }) => {
  const color = 'var(--gray-12)';
  const commonStyle: CSSProperties = { left: commandedTimePercent, position: 'absolute', pointerEvents: 'none' };
  return (
    <>
      <FaCaretDown style={{ ...commonStyle, top: 0, color, fontSize: 14, marginLeft: -7, marginTop: -6 }} />
      <div style={{ ...commonStyle, bottom: 0, top: 0, backgroundColor: color, width: currentTimeWidth, boxShadow: outlineShadow }} />
      <FaCaretUp style={{ ...commonStyle, bottom: 0, color, fontSize: 14, marginLeft: -7, marginBottom: -5 }} />
    </>
  );
});

const timelineHeight = 36;

function Timeline({
  fileDurationNonZero,
  playerTime,
  commandedTime,
  relevantTime,
  zoom,
  neighbouringKeyFrames,
  seekAbs,
  cutSegments,
  setCurrentSegIndex,
  currentSegIndexSafe,
  currentCutSeg,
  inverseCutSegments,
  formatTimecode,
  waveforms,
  overviewWaveform,
  shouldShowWaveform,
  shouldShowKeyframes,
  thumbnails,
  zoomWindowStartTime,
  zoomWindowEndTime,
  onZoomWindowStartTimeChange,
  onGenerateOverviewWaveformClick,
  waveformEnabled,
  waveformHeight,
  showThumbnails,
  onWheel,
  commandedTimeRef,
  goToTimecode,
  darkMode,
  setCutTime,
  setHoveringTime,
} : {
  fileDurationNonZero: number,
  startTimeOffset: number,
  playerTime: number | undefined,
  commandedTime: number,
  relevantTime: number,
  zoom: number,
  neighbouringKeyFrames: Frame[],
  seekAbs: (a: number) => void,
  cutSegments: StateSegment[],
  setCurrentSegIndex: (a: number) => void,
  currentSegIndexSafe: number,
  currentCutSeg: StateSegment | undefined,
  inverseCutSegments: InverseCutSegment[],
  formatTimecode: FormatTimecode,
  waveforms: WaveformSlice[],
  overviewWaveform: OverviewWaveform | undefined,
  shouldShowWaveform: boolean,
  shouldShowKeyframes: boolean,
  thumbnails: Thumbnail[],
  zoomWindowStartTime: number,
  zoomWindowEndTime: number | undefined,
  onZoomWindowStartTimeChange: (a: number) => void,
  onGenerateOverviewWaveformClick: () => void,
  waveformEnabled: boolean,
  waveformHeight: number,
  showThumbnails: boolean,
  playing: boolean,
  isFileOpened: boolean,
  onWheel: WheelEventHandler,
  commandedTimeRef: MutableRefObject<number>,
  goToTimecode: () => void,
  darkMode: boolean,
  setCutTime: UseSegments['setCutTime'],
  setHoveringTime: (time: number | undefined) => void,
}) {
  const { t } = useTranslation();

  const { invertCutSegments, springAnimation, segmentMouseModifierKey, collapseTimelineGaps } = useUserSettings();

  // When collapsed, the parts that are not covered by any segment are hidden from the timeline
  const visibleRanges = useMemo(() => (collapseTimelineGaps && !invertCutSegments ? getVisibleRanges(cutSegments, fileDurationNonZero) : undefined), [collapseTimelineGaps, cutSegments, fileDurationNonZero, invertCutSegments]);
  // While resizing/moving a segment, keep the layout, so that the timeline doesn't shift under the mouse
  const [frozenRanges, setFrozenRanges] = useState<TimeRange[]>();
  const mapping = useMemo(() => createTimelineMapping({ ranges: frozenRanges ?? visibleRanges, fileDuration: fileDurationNonZero }), [fileDurationNonZero, frozenRanges, visibleRanges]);
  const { fileToTimeline, timelineToFile, duration: timelineDuration } = mapping;
  const mappingRef = useRef(mapping);
  useEffect(() => {
    mappingRef.current = mapping;
  }, [mapping]);

  const timelineScrollerRef = useRef<HTMLDivElement>(null);
  const timelineScrollerSkipEventRef = useRef<boolean>(false);
  const timelineScrollerSkipEventDebounce = useRef<() => void>(undefined);
  const timelineWrapperRef = useRef<HTMLDivElement>(null);

  const isZoomed = zoom > 1;

  const keyFramesInZoomWindow = useMemo(() => {
    if (zoomWindowEndTime == null) return [];
    const windowStart = fileToTimeline(zoomWindowStartTime);
    const windowEnd = windowStart + timelineDuration / zoom;
    return neighbouringKeyFrames.filter((f) => {
      if (!mapping.isVisible(f.time)) return false;
      const pos = fileToTimeline(f.time);
      return pos >= windowStart && pos <= windowEnd;
    });
  }, [fileToTimeline, mapping, neighbouringKeyFrames, timelineDuration, zoom, zoomWindowEndTime, zoomWindowStartTime]);

  // Don't show keyframes if too packed together (at current zoom)
  // See https://github.com/mifi/lossless-cut/issues/259
  const areKeyframesTooClose = keyFramesInZoomWindow.length > zoom * 200;

  const getTimelinePos = useCallback((time: number) => fileToTimeline(time) / timelineDuration, [fileToTimeline, timelineDuration]);
  const currentTimePercent = useMemo(() => calculateTimelinePercent2(playerTime != null ? fileToTimeline(playerTime) : undefined, timelineDuration), [fileToTimeline, playerTime, timelineDuration]);
  const commandedTimePercent = useMemo(() => calculateTimelinePercent2(fileToTimeline(commandedTime), timelineDuration), [commandedTime, fileToTimeline, timelineDuration]);

  const timeOfInterestPosPixels = useMemo(() => {
    // https://github.com/mifi/lossless-cut/issues/676
    const pos = calculateTimelinePos(fileToTimeline(relevantTime), timelineDuration);
    // eslint-disable-next-line react-hooks/refs
    if (pos != null && timelineScrollerRef.current) return pos * zoom * timelineScrollerRef.current!.offsetWidth;
    return undefined;
  }, [fileToTimeline, relevantTime, timelineDuration, zoom]);

  const calcZoomWindowStartTime = useCallback(() => (timelineScrollerRef.current
    ? timelineToFile((timelineScrollerRef.current.scrollLeft / (timelineScrollerRef.current!.offsetWidth * zoom)) * timelineDuration)
    : 0), [timelineDuration, timelineToFile, zoom]);

  // const zoomWindowStartTime = calcZoomWindowStartTime(duration, zoom);

  useEffect(() => {
    timelineScrollerSkipEventDebounce.current = debounce(() => {
      timelineScrollerSkipEventRef.current = false;
    }, 1000);
  }, []);

  function suppressScrollerEvents() {
    timelineScrollerSkipEventRef.current = true;
    timelineScrollerSkipEventDebounce.current?.();
  }

  const scrollLeftMotion = useMotionValue(0);

  const spring = useSpring(scrollLeftMotion, { damping: 100, stiffness: 1000 });

  useEffect(() => {
    spring.on('change', (value) => {
      if (timelineScrollerSkipEventRef.current) return; // Don't animate while zooming
      timelineScrollerRef.current!.scrollLeft = value;
    });
  }, [spring]);

  // Pan timeline when cursor moves out of timeline window
  useEffect(() => {
    if (timeOfInterestPosPixels == null || timelineScrollerSkipEventRef.current) return;

    invariant(timelineScrollerRef.current != null);
    if (timeOfInterestPosPixels > timelineScrollerRef.current.scrollLeft + timelineScrollerRef.current.offsetWidth) {
      const timelineWidth = timelineWrapperRef.current!.offsetWidth;
      const scrollLeft = timeOfInterestPosPixels - (timelineScrollerRef.current.offsetWidth * 0.1);
      scrollLeftMotion.set(Math.min(scrollLeft, timelineWidth - timelineScrollerRef.current.offsetWidth));
    } else if (timeOfInterestPosPixels < timelineScrollerRef.current.scrollLeft) {
      const scrollLeft = timeOfInterestPosPixels - (timelineScrollerRef.current.offsetWidth * 0.9);
      scrollLeftMotion.set(Math.max(scrollLeft, 0));
    }
  }, [timeOfInterestPosPixels, scrollLeftMotion]);

  // Keep cursor in middle while zooming
  useEffect(() => {
    suppressScrollerEvents();

    if (isZoomed) {
      invariant(timelineScrollerRef.current != null);
      const zoomedTargetWidth = timelineScrollerRef.current.offsetWidth * zoom;

      // mapping from ref, so that we don't scroll every time a segment changes
      const scrollLeft = Math.max((mappingRef.current.fileToTimeline(commandedTimeRef.current) / mappingRef.current.duration) * zoomedTargetWidth - timelineScrollerRef.current.offsetWidth / 2, 0);
      scrollLeftMotion.set(scrollLeft);
      timelineScrollerRef.current.scrollLeft = scrollLeft;
    }
  }, [zoom, fileDurationNonZero, commandedTimeRef, scrollLeftMotion, isZoomed]);


  useEffect(() => {
    const cancelWheel = (event: WheelEvent) => event.preventDefault();

    const scroller = timelineScrollerRef.current;
    invariant(scroller != null);
    scroller.addEventListener('wheel', cancelWheel, { passive: false });

    return () => {
      scroller.removeEventListener('wheel', cancelWheel);
    };
  }, []);

  const onTimelineScroll = useCallback(() => {
    onZoomWindowStartTimeChange(calcZoomWindowStartTime());
  }, [calcZoomWindowStartTime, onZoomWindowStartTimeChange]);

  // Keep cursor in middle while scrolling
  /* const onTimelineScroll = useCallback((e) => {
    onZoomWindowStartTimeChange(zoomWindowStartTime);

    if (!zoomed || timelineScrollerSkipEventRef.current) return;

    seekAbs((((e.target.scrollLeft + (timelineScrollerRef.current.offsetWidth * 0.5))
      / (timelineScrollerRef.current.offsetWidth * zoom)) * duration));
  }, [duration, seekAbs, zoomed, zoom, zoomWindowStartTime, onZoomWindowStartTimeChange]); */

  const getMouseTimelinePos = useCallback((e: MouseEvent) => {
    const target = timelineWrapperRef.current;
    invariant(target != null);
    const rect = target.getBoundingClientRect();
    const relX = e.pageX - (rect.left + document.body.scrollLeft);
    return timelineToFile((relX / target.offsetWidth) * timelineDuration);
  }, [timelineDuration, timelineToFile]);

  const mouseDownRef = useRef<unknown>(undefined);

  useEffect(() => {
    setHoveringTime(undefined);
  }, [relevantTime, setHoveringTime]);

  // for performance
  const currentCutSegRef = useRef<StateSegment | undefined>(currentCutSeg);
  useEffect(() => {
    currentCutSegRef.current = currentCutSeg;
  }, [currentCutSeg]);

  const resizingSegmentRef = useRef<{ operation: 'start' | 'end' | 'move', offset?: number } | undefined>(undefined);

  const onMouseDown = useCallback<MouseEventHandler<HTMLElement>>((e) => {
    if (e.nativeEvent.buttons !== 1) return; // not primary button

    const mouseTimelinePos = getMouseTimelinePos(e.nativeEvent);
    seekAbs(mouseTimelinePos);

    // eslint-disable-next-line no-shadow
    const currentCutSeg = currentCutSegRef.current;

    // start/end handles 1.5% of visible timeline
    const threshold = ((0.01 / 2) * timelineDuration) / zoom;
    const isNear = (time: number) => Math.abs(fileToTimeline(mouseTimelinePos) - fileToTimeline(time)) < threshold;

    if (currentCutSeg != null && currentCutSeg.selected && e[keyMap[segmentMouseModifierKey]]) {
      if (isNear(currentCutSeg.start)) {
        resizingSegmentRef.current = { operation: currentCutSeg.end == null ? 'move' : 'start' }; // move marker or resize segment
      } else if (currentCutSeg.end != null && isNear(currentCutSeg.end)) {
        resizingSegmentRef.current = { operation: 'end' };
      } else if (currentCutSeg.end != null && mouseTimelinePos >= currentCutSeg.start && mouseTimelinePos <= currentCutSeg.end) {
        resizingSegmentRef.current = { operation: 'move', offset: mouseTimelinePos - currentCutSeg.start };
      }
    }

    if (resizingSegmentRef.current != null && mapping.collapsed) setFrozenRanges(mapping.ranges);

    mouseDownRef.current = e.target;

    function onMouseMove(e2: MouseEvent) {
      if (mouseDownRef.current == null) return;
      const mouseDragTimelinePos = getMouseTimelinePos(e2);
      seekAbs(mouseDragTimelinePos);
      try {
        // eslint-disable-next-line unicorn/prefer-switch
        if (resizingSegmentRef.current?.operation === 'start') {
          setCutTime('start', mouseDragTimelinePos);
        } else if (resizingSegmentRef?.current?.operation === 'end') {
          setCutTime('end', mouseDragTimelinePos);
        } else if (resizingSegmentRef?.current?.operation === 'move') {
          setCutTime('move', mouseDragTimelinePos - (resizingSegmentRef.current.offset ?? 0));
        }
      } catch (err) {
        console.warn('Error while resizing segment:', err instanceof Error ? err.message : err);
      }
    }

    function onMouseUp() {
      mouseDownRef.current = undefined;
      resizingSegmentRef.current = undefined;
      setFrozenRanges(undefined);
      window.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('mousemove', onMouseMove);
    }

    // https://github.com/mifi/lossless-cut/issues/1432
    // https://stackoverflow.com/questions/11533098/how-to-catch-mouse-up-event-outside-of-element
    // https://stackoverflow.com/questions/6073505/what-is-the-difference-between-screenx-y-clientx-y-and-pagex-y
    window.addEventListener('mouseup', onMouseUp, { once: true });
    window.addEventListener('mousemove', onMouseMove);
  }, [fileToTimeline, getMouseTimelinePos, mapping, seekAbs, segmentMouseModifierKey, setCutTime, timelineDuration, zoom]);

  const onMouseMove = useCallback<MouseEventHandler<HTMLDivElement>>((e) => {
    if (!mouseDownRef.current) { // no button pressed
      setHoveringTime(getMouseTimelinePos(e.nativeEvent));
    }
    e.preventDefault();
  }, [getMouseTimelinePos, setHoveringTime]);

  const onMouseOut = useCallback(() => setHoveringTime(undefined), [setHoveringTime]);

  const contextMenuTemplate = useMemo(() => [
    { label: t('Seek to timecode'), click: goToTimecode },
  ], [goToTimecode, t]);

  useContextMenu(timelineScrollerRef, contextMenuTemplate);

  const visibleThumbnails = useMemo(() => thumbnails.filter((thumbnail) => mapping.isVisible(thumbnail.time)), [mapping, thumbnails]);

  // where hidden parts were removed from the timeline
  const collapsedPoints = useMemo(() => {
    const { ranges } = mapping;
    const points = ranges.slice(1).map(({ start }) => start);
    if (ranges[0]!.start > 0) points.unshift(ranges[0]!.start);
    if (ranges.at(-1)!.end < fileDurationNonZero) points.push(ranges.at(-1)!.end);
    return points;
  }, [fileDurationNonZero, mapping]);

  const onGenerateOverviewWaveformClick2 = useCallback<MouseEventHandler<HTMLButtonElement>>((e) => {
    e.preventDefault(); // todo this doesn't work. dunno why
    onGenerateOverviewWaveformClick();
  }, [onGenerateOverviewWaveformClick]);

  return (
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions,jsx-a11y/mouse-events-have-key-events
    <div
      className="no-user-select"
      style={{ position: 'relative', borderTop: '1px solid var(--gray-7)', borderBottom: '1px solid var(--gray-7)' }}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      // eslint-disable-next-line jsx-a11y/mouse-events-have-key-events
      onMouseOut={onMouseOut}
    >
      {(waveformEnabled && !shouldShowWaveform) && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: timelineHeight, bottom: timelineHeight, left: 0, right: 0, color: 'var(--gray-11)' }}>
          {t('Zoom in more to view waveform')}
          <Button onClick={onGenerateOverviewWaveformClick2} style={{ marginLeft: '.5em' }}>{t('Load overview')}</Button>
        </div>
      )}

      <div
        style={{ overflowX: 'scroll', overflowY: 'hidden' }}
        className="hide-scrollbar"
        onWheel={onWheel}
        onScroll={onTimelineScroll}
        ref={timelineScrollerRef}
      >
        {waveformEnabled && shouldShowWaveform && (waveforms.length > 0 || overviewWaveform != null) && (
          <Waveforms
            mapping={mapping}
            fileDurationNonZero={fileDurationNonZero}
            waveforms={waveforms}
            overviewWaveform={overviewWaveform}
            zoom={zoom}
            darkMode={darkMode}
            height={waveformHeight}
          />
        )}

        {showThumbnails && (
          <div style={{ height: 60, width: `${zoom * 100}%`, position: 'relative', marginBottom: 3 }}>
            {visibleThumbnails.map((thumbnail, i) => {
              const leftPercent = getTimelinePos(thumbnail.time) * 100;
              const nextThumbnail = visibleThumbnails[i + 1];
              const nextThumbPos = nextThumbnail ? getTimelinePos(nextThumbnail.time) : 1;
              const maxWidthPercent = (nextThumbPos - getTimelinePos(thumbnail.time)) * 100 * 0.9;
              return (
                <img key={thumbnail.url} src={thumbnail.url} alt="" style={{ position: 'absolute', left: `${leftPercent}%`, height: '100%', boxSizing: 'border-box', maxWidth: `${maxWidthPercent}%`, objectFit: 'cover', border: '1px solid rgba(255, 255, 255, 0.5)', borderBottomRightRadius: 15, borderTopLeftRadius: 15, borderTopRightRadius: 15, pointerEvents: 'none' }} />
              );
            })}
          </div>
        )}

        <div
          style={{ height: timelineHeight, width: `${zoom * 100}%`, position: 'relative', backgroundColor: timelineBackground, transition: darkModeTransition }}
          ref={timelineWrapperRef}
        >
          {mapping.collapsed ? collapsedPoints.map((time) => (
            <div key={time} style={{ position: 'absolute', top: 0, bottom: 0, left: `${getTimelinePos(time) * 100}%`, width: 0, marginLeft: -1, borderLeft: '2px dashed var(--gray-10)', pointerEvents: 'none' }} />
          )) : inverseCutSegments.map((seg) => (
            <BetweenSegments
              key={seg.segId}
              start={seg.start}
              end={seg.end}
              fileDurationNonZero={fileDurationNonZero}
              invertCutSegments={invertCutSegments}
            />
          ))}

          {cutSegments.map((seg, i) => {
            const selected = invertCutSegments || seg.selected;

            return (
              <TimelineSeg
                key={seg.segId}
                seg={seg}
                segNum={i}
                onSegClick={setCurrentSegIndex}
                isActive={i === currentSegIndexSafe}
                getTimelinePos={getTimelinePos}
                invertCutSegments={invertCutSegments}
                formatTimecode={formatTimecode}
                selected={selected}
              />
            );
          })}

          {shouldShowKeyframes && !areKeyframesTooClose && keyFramesInZoomWindow.map((f) => (
            <div key={f.time} style={{ position: 'absolute', top: 0, bottom: 0, left: `${getTimelinePos(f.time) * 100}%`, marginLeft: -1, width: 1, background: 'var(--gray-10)', boxShadow: '1px 0 0 var(--gray-1)', pointerEvents: 'none' }} />
          ))}

          {currentTimePercent !== undefined && (
            <motion.div transition={springAnimation} animate={{ left: currentTimePercent }} style={{ position: 'absolute', bottom: 0, top: 0, backgroundColor: 'var(--gray-12)', width: currentTimeWidth, boxShadow: outlineShadow, pointerEvents: 'none' }} />
          )}
          {commandedTimePercent !== undefined && (
            <CommandedTime commandedTimePercent={commandedTimePercent} />
          )}
        </div>
      </div>
    </div>
  );
}

export default memo(Timeline);
