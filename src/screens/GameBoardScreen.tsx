/**
 * GameBoardScreen — single-player Kentucky Rook vs 3 AI opponents
 * Enhanced: Dramatic bidding overlay, cinematic trump reveal,
 *           trick fan animation, card shimmer during bidding,
 *           Balatro-style dark theme, live scoreboard with animations,
 *           screen shake, particle burst, felt table background.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Modal,
  Platform,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { getAIAction } from '../ai/basicAI';
import {
  bid,
  callTrump,
  createGame,
  discardToWidow,
  getValidPlays,
  pickUpWidow,
  playCard,
  startDeal,
} from '../engine/gameEngine';
import { Card, Color, Difficulty, GameState } from '../engine/types';
import { scoreHand } from '../engine/scoring';

// ---------------------------------------------------------------------------
// Colors — Dusty old card table theme
// ---------------------------------------------------------------------------

const C = {
  bg: '#2b1e0f',           // aged, darkened wood
  bgInner: '#4a3420',      // worn table surface, faded brown
  bgOuter: '#1a1008',      // grimy shadow edges
  feltGreen: '#3a4a30',    // faded, dusty olive-green felt
  gold: '#b8860b',         // tarnished gold
  goldDim: '#6b5010',
  goldGlow: 'rgba(184,134,11,0.4)',
  red: '#7a2020',          // faded red
  redDeep: '#4a1010',
  cardBg: '#e8dcc0',       // yellowed, aged card stock
  textMuted: '#a08860',    // dusty tan text
  green: '#2a4a18',
  white: '#d8ccb0',        // off-white, aged
  black: '#1a1208',
  dimOverlay: 'rgba(15,10,4,0.75)',
};

const TRUMP_COLORS: Record<Color, string> = {
  Black: '#e0e0e0',
  Red: '#cc2222',
  Green: '#22bb44',
  Yellow: '#d4a017',
};


function TrumpToken({ seat, bidWinner, trump }: { seat: number; bidWinner: number; trump: string | null }) {
  if (bidWinner !== seat) return null;
  const color = trump ? (TRUMP_COLORS as Record<string, string>)[trump] ?? '#888' : '#888';
  const label = trump ? trump[0] : '?';
  return (
    <View style={{
      width: 22, height: 22, borderRadius: 11,
      backgroundColor: color,
      borderWidth: 2, borderColor: 'rgba(255,255,255,0.3)',
      alignItems: 'center', justifyContent: 'center',
      shadowColor: color, shadowOpacity: 0.7, shadowRadius: 5, elevation: 4,
    }}>
      <Text style={{ color: '#fff', fontSize: 10, fontWeight: '900' }}>T</Text>
    </View>
  );
}

const CARD_BORDER_COLOR: Record<string, string> = {
  Black: '#222222',
  Red: '#cc2200',
  Green: '#1a7a1a',
  Yellow: '#c8960c',
  Rook: '#c8960c',
};

const CARD_TEXT_COLOR: Record<string, string> = {
  Black: '#111111',
  Red: '#cc0000',
  Green: '#1a7a1a',
  Yellow: '#b8860b',
  Rook: '#c8960c',
};

// High-contrast dot fill colors for the center circle
const SUIT_CIRCLE_COLOR: Record<string, string> = {
  Black: '#111111',
  Red: '#cc0000',
  Green: '#1a7a1a',
  Yellow: '#b8860b',
  Rook: '#c8960c',
};

function SuitCircle({ color, size = 14 }: { color: string; size?: number }) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: SUIT_CIRCLE_COLOR[color] ?? '#888',
        borderWidth: color === 'Black' ? 1 : 0,
        borderColor: 'rgba(255,255,255,0.4)',
      }}
    />
  );
}

const SUIT_DOT: Record<string, string> = {
  Black: '⚫',
  Red: '🔴',
  Green: '🟢',
  Yellow: '🟡',
  Rook: '🐦',
};

const COLOR_NAMES: Color[] = ['Black', 'Red', 'Green', 'Yellow'];

const COLOR_ORDER: Record<string, number> = { Black: 0, Red: 1, Green: 2, Yellow: 3, Rook: 4 };
const RANK_ORDER: Record<string | number, number> = { Rook: 0, 1: 1, 14: 2, 13: 3, 12: 4, 11: 5, 10: 6, 9: 7, 8: 8, 7: 9, 6: 10, 5: 11, 4: 12, 3: 13, 2: 14 };

function sortHand(cards: import('../engine/types').Card[]): import('../engine/types').Card[] {
  return [...cards].sort((a, b) => {
    const colorDiff = (COLOR_ORDER[a.color] ?? 9) - (COLOR_ORDER[b.color] ?? 9);
    if (colorDiff !== 0) return colorDiff;
    return (RANK_ORDER[a.value] ?? 99) - (RANK_ORDER[b.value] ?? 99);
  });
}

// ---------------------------------------------------------------------------
// Felt dot background
// ---------------------------------------------------------------------------

function FeltBackground() {
  const { width: sw, height: sh } = Dimensions.get('window');
  const SPACING = 60;
  const dots: { x: number; y: number }[] = [];
  for (let x = 0; x < sw + SPACING; x += SPACING) {
    for (let y = 0; y < sh + SPACING; y += SPACING) {
      dots.push({ x, y });
    }
  }
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {/* Outer dark edge */}
      <View style={fbStyles.outerEdge} />
      {/* Lighter center */}
      <View style={fbStyles.innerCenter} />
      {/* Dots */}
      {dots.map((d, i) => (
        <View
          key={i}
          style={[fbStyles.dot, { left: d.x - 2, top: d.y - 2 }]}
        />
      ))}
    </View>
  );
}

const fbStyles = StyleSheet.create({
  outerEdge: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: C.bgOuter,
  },
  innerCenter: {
    position: 'absolute',
    top: 60,
    left: 40,
    right: 40,
    bottom: 60,
    borderRadius: 200,
    backgroundColor: C.bgInner,
  },
  dot: {
    position: 'absolute',
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#ffffff',
    opacity: 0.06,
  },
});

// ---------------------------------------------------------------------------
// Card rendering — Balatro premium style
// ---------------------------------------------------------------------------

type CardSize = 'hand' | 'bigHand' | 'play' | 'mini';

interface CardProps {
  card: Card;
  size?: CardSize;
  valid?: boolean;
  selected?: boolean;
  winner?: boolean;
  onPress?: () => void;
  style?: object;
}

function cardDims(size: CardSize) {
  switch (size) {
    case 'bigHand': return { w: 80, h: 115 };
    case 'hand':    return { w: 62, h: 88 };
    case 'play':    return { w: 68, h: 96 };
    case 'mini':    return { w: 38, h: 54 };
  }
}

function PlayingCard({ card, size = 'hand', valid = true, selected = false, winner = false, onPress, style }: CardProps) {
  const { w, h } = cardDims(size);
  const isRook = card.value === 'Rook';
  const label = isRook ? 'R' : String(card.value);
  const borderColor = CARD_BORDER_COLOR[card.color] ?? '#333';
  const textColor = isRook ? C.gold : (CARD_TEXT_COLOR[card.color] ?? '#111');
  const dotColor = SUIT_CIRCLE_COLOR[card.color] ?? '#111';
  const valueFontSize = size === 'mini' ? 9 : 14;
  const dotCircleSize = size === 'mini' ? 10 : 16;

  if (isRook) {
    return (
      <TouchableOpacity
        onPress={onPress}
        disabled={!onPress || !valid}
        activeOpacity={0.75}
        style={[
          styles.card,
          {
            width: w, height: h,
            backgroundColor: '#0d0d0d',
            borderColor: C.gold,
            borderWidth: 3,
            borderRadius: 10,
            shadowColor: C.gold,
            shadowOpacity: 0.7,
            shadowRadius: 10,
            shadowOffset: { width: 0, height: 0 },
          },
          !valid && styles.cardInvalid,
          selected && styles.cardSelected,
          style,
        ]}
      >
        <View style={styles.cardCornerTL}>
          <Text style={{ fontSize: size === 'mini' ? 10 : 16, fontWeight: '900', color: C.gold, lineHeight: size === 'mini' ? 13 : 20 }}>R</Text>
        </View>
        <View style={{ alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontSize: size === 'mini' ? 16 : 32 }}>🐦</Text>
          {size !== 'mini' && (
            <Text style={{ fontSize: 8, fontWeight: '800', color: C.gold, letterSpacing: 3, marginTop: 2 }}>ROOK</Text>
          )}
        </View>
        <View style={styles.cardCornerBR}>
          <Text style={{ fontSize: size === 'mini' ? 10 : 16, fontWeight: '900', color: C.gold, transform: [{ rotate: '180deg' }], lineHeight: size === 'mini' ? 13 : 20 }}>R</Text>
        </View>
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={!onPress || !valid}
      activeOpacity={0.75}
      style={[
        styles.card,
        {
          width: w, height: h,
          backgroundColor: C.cardBg,
          borderColor: winner ? C.gold : (selected ? C.gold : borderColor),
          borderWidth: selected || winner ? 2.5 : 2,
          shadowColor: borderColor,
          shadowOpacity: winner ? 0.9 : 0.5,
          shadowRadius: winner ? 16 : 6,
          shadowOffset: { width: 0, height: 2 },
        },
        !valid && styles.cardInvalid,
        selected && styles.cardSelected,
        style,
      ]}
    >
      {/* Top-left: value only, large bold */}
      <View style={styles.cardCornerTL}>
        <Text style={[styles.cardValue, { fontSize: valueFontSize, color: textColor }]}>{label}</Text>
      </View>

      {/* Center: single colored dot */}
      <View style={[
        styles.cardCenterDot,
        { width: dotCircleSize, height: dotCircleSize, borderRadius: dotCircleSize / 2, backgroundColor: dotColor },
      ]} />

      {/* Bottom-right: value rotated 180° */}
      <View style={styles.cardCornerBR}>
        <Text style={[styles.cardValue, { fontSize: valueFontSize, color: textColor, transform: [{ rotate: '180deg' }] }]}>{label}</Text>
      </View>

      {/* Points badge bottom-center, only if points > 0 */}
      {card.points > 0 && (
        <View style={[styles.cardPointsBadge, { backgroundColor: textColor }]}>
          <Text style={{ fontSize: size === 'mini' ? 6 : 9, fontWeight: '700', color: '#ffffff' }}>
            {card.points}
          </Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

// ---------------------------------------------------------------------------
// FaceDownCard — Balatro dark back with diamond pattern
// ---------------------------------------------------------------------------

function FaceDownCard({ count }: { count: number }) {
  return (
    <View style={styles.faceDownStack}>
      <View style={styles.faceDownCard}>
        {/* Diamond pattern overlay */}
        <View style={fdStyles.diamond1} />
        <View style={fdStyles.diamond2} />
        <View style={fdStyles.diamond3} />
        <Text style={styles.faceDownText}>🐦</Text>
      </View>
      {count > 0 && (
        <View style={styles.faceDownBadge}>
          <Text style={styles.faceDownCount}>{count}</Text>
        </View>
      )}
    </View>
  );
}

const fdStyles = StyleSheet.create({
  diamond1: {
    position: 'absolute',
    width: 22, height: 22,
    borderWidth: 1, borderColor: 'rgba(200,150,12,0.25)',
    transform: [{ rotate: '45deg' }],
    top: 8, left: 10,
  },
  diamond2: {
    position: 'absolute',
    width: 14, height: 14,
    borderWidth: 1, borderColor: 'rgba(200,150,12,0.15)',
    transform: [{ rotate: '45deg' }],
    top: 12, left: 14,
  },
  diamond3: {
    position: 'absolute',
    width: 34, height: 34,
    borderWidth: 1, borderColor: 'rgba(200,150,12,0.12)',
    transform: [{ rotate: '45deg' }],
    top: 2, left: 4,
  },
});

// ---------------------------------------------------------------------------
// FannedHand
// ---------------------------------------------------------------------------

interface FannedHandProps {
  cards: Card[];
  validIds: Set<string>;
  isDiscard: boolean;
  isPlaying: boolean;
  selectedDiscard: Set<string>;
  playingCardId: string | null;
  onCardPress: (card: Card) => void;
  onToggleDiscard: (card: Card) => void;
  cardSize?: CardSize;
  shimmerAnim?: Animated.Value;
}

function FannedHand({
  cards,
  validIds,
  isDiscard,
  isPlaying,
  selectedDiscard,
  playingCardId,
  onCardPress,
  onToggleDiscard,
  cardSize = 'hand',
  shimmerAnim,
}: FannedHandProps) {
  const { width: screenWidth } = Dimensions.get('window');
  const { w: CARD_W } = cardDims(cardSize);
  // Bidding phase shows more of each card — only overlap by 20px max
  const OVERLAP = cardSize === 'bigHand' ? 8 : Math.max(CARD_W - 45, 8);
  const CONTAINER_H = cardSize === 'bigHand' ? 240 : 165;
  const MAX_ANGLE = 25;
  const ARC_DEPTH = 18;

  const liftAnims = useRef<Map<string, Animated.Value>>(new Map());

  cards.forEach(card => {
    if (!liftAnims.current.has(card.id)) {
      liftAnims.current.set(card.id, new Animated.Value(0));
    }
  });

  useEffect(() => {
    cards.forEach(card => {
      const anim = liftAnims.current.get(card.id);
      if (!anim) return;
      Animated.timing(anim, {
        toValue: selectedDiscard.has(card.id) ? 1 : 0,
        duration: 150,
        useNativeDriver: true,
      }).start();
    });
  }, [selectedDiscard, cards]);

  const N = cards.length;
  const totalW = N > 0 ? OVERLAP * (N - 1) + CARD_W : CARD_W;
  const needsScroll = N > 9;
  const startX = Math.max(8, (screenWidth - totalW) / 2);

  const shimmerBorder = shimmerAnim
    ? shimmerAnim.interpolate({
        inputRange: [0, 0.5, 1],
        outputRange: ['#c8960c', '#ffffff', '#c8960c'],
      })
    : null;

  const handContent = (
    <View style={{ height: CONTAINER_H, width: needsScroll ? Math.max(totalW + 16, screenWidth) : '100%', minWidth: '100%' }}>
      {cards.map((card, i) => {
        const norm = N > 1 ? i / (N - 1) - 0.5 : 0;
        const angle = norm * MAX_ANGLE * 2;
        const x = startX + i * OVERLAP;
        const arcBottom = 12 + Math.abs(norm) * ARC_DEPTH;

        const isValid = validIds.has(card.id) || isDiscard;
        const isSelected = selectedDiscard.has(card.id);
        const liftAnim = liftAnims.current.get(card.id) ?? new Animated.Value(0);
        const liftTranslateY = liftAnim.interpolate({ inputRange: [0, 1], outputRange: [0, -20] });

        const isPlayable = isPlaying && validIds.has(card.id);

        const cardEl = (
          <PlayingCard
            card={card}
            size={cardSize}
            valid={isValid}
            selected={isSelected}
            onPress={
              isDiscard
                ? () => onToggleDiscard(card)
                : isPlaying
                ? () => onCardPress(card)
                : undefined
            }
            style={
              isPlayable
                ? {
                    borderColor: C.gold,
                    borderWidth: 2.5,
                    shadowColor: C.gold,
                    shadowOpacity: 0.8,
                    shadowRadius: 8,
                  }
                : {}
            }
          />
        );

        return (
          <Animated.View
            key={card.id}
            style={{
              position: 'absolute',
              left: x,
              bottom: arcBottom,
              zIndex: i,
              transform: [{ rotate: `${angle}deg` }, { translateY: liftTranslateY }, { scale: isSelected ? 1.08 : (isPlayable ? 1.05 : 1) }],
            }}
          >
            {shimmerBorder ? (
              <Animated.View
                style={{
                  borderRadius: 10,
                  borderWidth: 2.5,
                  borderColor: shimmerBorder,
                  shadowColor: '#ffffff',
                  shadowOpacity: 0.4,
                  shadowRadius: 8,
                }}
              >
                {cardEl}
              </Animated.View>
            ) : (
              cardEl
            )}
          </Animated.View>
        );
      })}
    </View>
  );

  if (needsScroll) {
    return (
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ height: CONTAINER_H, width: '100%' }}
        contentContainerStyle={{ minWidth: '100%' }}
      >
        {handContent}
      </ScrollView>
    );
  }

  return handContent;
}

// ---------------------------------------------------------------------------
// Live Scoreboard Header
// ---------------------------------------------------------------------------

interface ScoreboardProps {
  scores: number[];          // game cumulative
  handPoints: [number, number]; // current hand trick points
  handTricks: [number, number]; // tricks won this hand
  bidAmount: number;
  biddingTeam: number | null;
  trump: Color | null;
  trumpHeaderPulse: Animated.Value;
  scoreScaleAnims: Animated.Value[];
  scoreColorAnims: Animated.Value[];
  onBack: () => void;
}

function Scoreboard({
  scores, handPoints, handTricks, bidAmount, biddingTeam, trump,
  trumpHeaderPulse, scoreScaleAnims, scoreColorAnims, onBack,
}: ScoreboardProps) {
  const team0Color = scoreColorAnims[0].interpolate({
    inputRange: [0, 1],
    outputRange: [C.gold, '#ffffff'],
  });
  const team1Color = scoreColorAnims[1].interpolate({
    inputRange: [0, 1],
    outputRange: [C.gold, '#ffffff'],
  });

  return (
    <View style={sbStyles.container}>
      <TouchableOpacity onPress={onBack} style={sbStyles.backBtn}>
        <Text style={sbStyles.backBtnText}>← Back</Text>
      </TouchableOpacity>

      <View style={sbStyles.teamsRow}>
        {/* Team 1 (Us: seats 0,2) */}
        <View style={[sbStyles.teamBlock, biddingTeam === 0 && sbStyles.teamBlockBidder]}>
          <Text style={[sbStyles.teamLabel, biddingTeam === 0 && sbStyles.teamLabelBidder]}>US</Text>
          <Animated.Text style={[sbStyles.teamScore, { transform: [{ scale: scoreScaleAnims[0] }], color: team0Color }]}>
            {handPoints[0]}
          </Animated.Text>
          <Text style={sbStyles.gameScore}>{scores[0]}{scores[0] >= 450 ? ' 🔥' : ''}</Text>
          <Text style={sbStyles.tricksLabel}>{handTricks[0]} tricks</Text>
          {biddingTeam === 0 && bidAmount > 0 && (
            <Text style={sbStyles.needLabel}>
              {handPoints[0] >= bidAmount ? '✅ Made it!' : `need ${bidAmount - handPoints[0]}`}
            </Text>
          )}
        </View>

        {/* Center info */}
        <View style={sbStyles.centerInfo}>
          {trump ? (
            <Animated.View style={{ alignItems: 'center', transform: [{ scale: trumpHeaderPulse }] }}>
              <SuitCircle color={trump} size={18} />
              <Text style={[sbStyles.trumpLabel, { color: TRUMP_COLORS[trump], marginTop: 3 }]}>
                {trump}
              </Text>
            </Animated.View>
          ) : (
            <Text style={sbStyles.vsText}>VS</Text>
          )}
          {bidAmount > 0 && (
            <Text style={sbStyles.bidText}>
              Bid {bidAmount}{'\n'}
              <Text style={sbStyles.bidTeam}>{biddingTeam === 0 ? 'Us' : 'Them'}</Text>
            </Text>
          )}
        </View>

        {/* Team 2 (Them: seats 1,3) */}
        <View style={[sbStyles.teamBlock, biddingTeam === 1 && sbStyles.teamBlockBidder]}>
          <Text style={[sbStyles.teamLabel, biddingTeam === 1 && sbStyles.teamLabelBidder]}>THEM</Text>
          <Animated.Text style={[sbStyles.teamScore, { transform: [{ scale: scoreScaleAnims[1] }], color: team1Color }]}>
            {handPoints[1]}
          </Animated.Text>
          <Text style={sbStyles.gameScore}>{scores[1]}{scores[1] >= 450 ? ' 🔥' : ''}</Text>
          <Text style={sbStyles.tricksLabel}>{handTricks[1]} tricks</Text>
          {biddingTeam === 1 && bidAmount > 0 && (
            <Text style={sbStyles.needLabel}>
              {handPoints[1] >= bidAmount ? '✅ Made it!' : `need ${bidAmount - handPoints[1]}`}
            </Text>
          )}
        </View>
      </View>
    </View>
  );
}

const sbStyles = StyleSheet.create({
  container: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: C.goldDim,
    backgroundColor: 'rgba(5,15,5,0.85)',
  },
  backBtn: { marginBottom: 4 },
  backBtnText: {
    color: C.gold,
    fontSize: 14,
    fontWeight: '600',
    textShadowColor: C.goldGlow,
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 4,
  },
  teamsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  teamBlock: { alignItems: 'center', flex: 0, minWidth: 80, marginHorizontal: 36 },
  teamLabel: {
    color: C.gold,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 3,
    textShadowColor: C.goldGlow,
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 4,
    opacity: 0.8,
  },
  teamScore: {
    fontSize: 36,
    fontWeight: '900',
    textShadowColor: C.goldGlow,
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 6,
  },
  gameScore: {
    color: C.textMuted,
    fontSize: 20,
    fontWeight: '700',
  },
  tricksLabel: {
    color: C.goldDim,
    fontSize: 12,
    marginTop: 1,
  },
  teamBlockBidder: {
    borderWidth: 1.5,
    borderColor: C.gold,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: 'rgba(200,150,12,0.08)',
  },
  teamLabelBidder: { color: C.gold },
  needLabel: {
    color: '#ff9944',
    fontSize: 11,
    fontWeight: '700',
    marginTop: 3,
    textAlign: 'center',
  },
  centerInfo: { alignItems: 'center', flex: 0, minWidth: 90, marginHorizontal: 4 },
  vsText: { color: C.goldDim, fontSize: 12, fontWeight: '700' },
  trumpText: {
    fontSize: 22,
    textShadowColor: C.gold,
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 8,
  },
  trumpLabel: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1,
    marginTop: 2,
  },
  bidText: {
    color: C.white,
    fontSize: 10,
    textAlign: 'center',
    marginTop: 2,
  },
  bidTeam: {
    color: C.textMuted,
    fontSize: 9,
  },
});

// ---------------------------------------------------------------------------
// Particles
// ---------------------------------------------------------------------------

const NUM_PARTICLES = 12;

interface ParticleState {
  x: Animated.Value;
  y: Animated.Value;
  opacity: Animated.Value;
  color: string;
}

function ParticleBurst({ particles, active, trump }: {
  particles: React.MutableRefObject<ParticleState[]>;
  active: boolean;
  trump: Color | null;
}) {
  if (!active) return null;
  const { width: sw, height: sh } = Dimensions.get('window');
  const cx = sw / 2 - 3;
  const cy = sh / 2 - 3;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {particles.current.map((p, i) => (
        <Animated.View
          key={i}
          style={{
            position: 'absolute',
            left: cx,
            top: cy,
            width: 6,
            height: 6,
            borderRadius: 2,
            backgroundColor: p.color,
            opacity: p.opacity,
            transform: [{ translateX: p.x }, { translateY: p.y }],
          }}
        />
      ))}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Felt trick table corner decoration
// ---------------------------------------------------------------------------

function FeltCornerDiamond({ style }: { style?: object }) {
  return (
    <View style={[feltStyles.cornerDiamond, style]} />
  );
}

const feltStyles = StyleSheet.create({
  cornerDiamond: {
    position: 'absolute',
    width: 12,
    height: 12,
    borderWidth: 1,
    borderColor: 'rgba(26,58,26,0.8)',
    transform: [{ rotate: '45deg' }],
  },
});

// ---------------------------------------------------------------------------
// Enhancement 1: BiddingModal
// ---------------------------------------------------------------------------

interface BiddingModalProps {
  visible: boolean;
  slideAnim: Animated.Value;
  opacityAnim: Animated.Value;
  pulseAnim: Animated.Value;
  shimmerAnim: Animated.Value;
  state: GameState;
  bidLog: string[];
  onPass: () => void;
  onBid: (amount: number) => void;
  selectedDiscard: Set<string>;
  onToggleDiscard: (card: Card) => void;
}

function BiddingModal({
  visible,
  slideAnim,
  opacityAnim,
  pulseAnim,
  shimmerAnim,
  state,
  bidLog,
  onPass,
  onBid,
  selectedDiscard,
  onToggleDiscard,
}: BiddingModalProps) {
  const { players, bidState, activePlayer } = state;
  const isMyTurn = activePlayer === 0;
  const minBid = Math.max(125, bidState.currentBid + 5);
  const humanHand = players[0].hand;
  const currentBidderName = players[activePlayer]?.name ?? '';

  const pulseStyle = { transform: [{ scale: pulseAnim }] };

  const SEAT_LABELS: Record<number, string> = { 0: 'You', 1: 'CPU 1', 2: 'CPU 2', 3: 'CPU 3' };

  return (
    <Modal visible={visible} transparent animationType="none">
      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          {
            backgroundColor: 'rgba(0,0,0,0.92)',
            transform: [{ translateY: slideAnim }],
            opacity: opacityAnim,
          },
        ]}
      >
        <View style={bStyles.titleArea}>
          <View style={bStyles.scoreStrip}>
            <Text style={bStyles.scoreStripUs}>US: {state.scores[0]}</Text>
            <Text style={bStyles.scoreStripVs}>—</Text>
            <Text style={bStyles.scoreStripThem}>THEM: {state.scores[1]}</Text>
          </View>
          <Animated.Text style={[bStyles.biddingTitle, pulseStyle]}>BIDDING</Animated.Text>
          {/* Big gold current bid — impossible to miss */}
          <Text style={bStyles.currentBidBig}>
            {bidState.currentBid > 0 ? bidState.currentBid : '—'}
          </Text>
          {bidState.currentBid > 0 && (
            <Text style={bStyles.lastBidder}>
              {players[bidState.currentBidder]?.name ?? ''} bid {bidState.currentBid}
            </Text>
          )}
          {/* YOUR TURN / CPU Thinking indicator */}
          {isMyTurn ? (
            <Animated.Text style={[bStyles.yourTurnLabel, { transform: [{ scale: pulseAnim }] }]}>
              YOUR TURN
            </Animated.Text>
          ) : (
            <Text style={bStyles.cpuThinkingLabel}>{currentBidderName} Thinking…</Text>
          )}
        </View>

        <View style={bStyles.seatDiamond}>
          <View style={bStyles.seatTop}>
            <SeatChip seat={2} name={SEAT_LABELS[2]} active={activePlayer === 2} bid={bidState.currentBidder === 2 ? bidState.currentBid : undefined} passed={bidState.passedSeats.has(2)} isDealer={bidState.dealer === 2} />
          </View>
          <View style={bStyles.seatMiddle}>
            <SeatChip seat={1} name={SEAT_LABELS[1]} active={activePlayer === 1} bid={bidState.currentBidder === 1 ? bidState.currentBid : undefined} passed={bidState.passedSeats.has(1)} isDealer={bidState.dealer === 1} />
            <View style={bStyles.seatCenter}>
              {!isMyTurn && (
                <Text style={bStyles.waitingText}>Waiting for{'\n'}{currentBidderName}…</Text>
              )}
            </View>
            <SeatChip seat={3} name={SEAT_LABELS[3]} active={activePlayer === 3} bid={bidState.currentBidder === 3 ? bidState.currentBid : undefined} passed={bidState.passedSeats.has(3)} isDealer={bidState.dealer === 3} />
          </View>
          <View style={bStyles.seatBottom}>
            <SeatChip seat={0} name="You" active={activePlayer === 0} bid={bidState.currentBidder === 0 ? bidState.currentBid : undefined} passed={bidState.passedSeats.has(0)} isDealer={bidState.dealer === 0} />
          </View>
        </View>

        {bidLog.length > 0 && (
          <View style={bStyles.bidLog}>
            {[...bidLog].slice(-4).reverse().map((entry, i) => (
              <Text key={i} style={[bStyles.bidLogEntry, i === 0 && bStyles.bidLogEntryLatest, { opacity: i === 0 ? 1 : 1 - i * 0.28 }]}>{entry}</Text>
            ))}
          </View>
        )}

        <View style={bStyles.buttons}>
          <TouchableOpacity
            style={[bStyles.btn, bStyles.btnBid, !isMyTurn && bStyles.btnDisabled]}
            onPress={isMyTurn ? () => onBid(minBid) : undefined}
            activeOpacity={isMyTurn ? 0.7 : 1}
          >
            <Text style={bStyles.btnBidText}>BID {minBid}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[bStyles.btn, bStyles.btnPass, !isMyTurn && bStyles.btnDisabled]}
            onPress={isMyTurn ? onPass : undefined}
            activeOpacity={isMyTurn ? 0.7 : 1}
          >
            <Text style={bStyles.btnPassText}>PASS</Text>
          </TouchableOpacity>
        </View>

        <View style={bStyles.handArea}>
          <Text style={bStyles.handLabel}>Your Hand</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={bStyles.flatHandScroll}>
            {sortHand(humanHand).map(card => (
              <PlayingCard key={card.id} card={card} size="bigHand" valid={true} selected={false} />
            ))}
          </ScrollView>
        </View>
      </Animated.View>
    </Modal>
  );
}

function SeatChip({ seat, name, active, bid, passed, isDealer }: { seat: number; name: string; active: boolean; bid?: number; passed?: boolean; isDealer?: boolean }) {
  return (
    <View style={[bStyles.seatChip, active && bStyles.seatChipActive]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
        {isDealer && <View style={bStyles.seatDealerChip}><Text style={bStyles.seatDealerChipText}>D</Text></View>}
        <Text style={[bStyles.seatChipText, active && bStyles.seatChipTextActive]}>{name}</Text>
      </View>
      {passed
        ? <Text style={bStyles.seatBidPassed}>PASS</Text>
        : bid ? <Text style={bStyles.seatBidAmount}>{bid}</Text>
        : null}
      {active && <View style={bStyles.seatActiveDot} />}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Enhancement 2: TrumpRevealModal
// ---------------------------------------------------------------------------

interface TrumpRevealModalProps {
  visible: boolean;
  color: Color | null;
  overlayOpacity: Animated.Value;
  textScale: Animated.Value;
  bannerX: Animated.Value;
}

function TrumpRevealModal({ visible, color, overlayOpacity, textScale, bannerX }: TrumpRevealModalProps) {
  if (!color) return null;
  const trumpColor = TRUMP_COLORS[color];

  return (
    <Modal visible={visible} transparent animationType="none">
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.88)', opacity: overlayOpacity, alignItems: 'center', justifyContent: 'center' }]}>
        <Animated.View
          style={[
            trStyles.banner,
            { backgroundColor: trumpColor, transform: [{ translateX: bannerX }] },
          ]}
        />
        <Animated.Text
          style={[
            trStyles.trumpName,
            { color: trumpColor, transform: [{ scale: textScale }] },
          ]}
        >
          {color.toUpperCase()}
        </Animated.Text>
        <Text style={trStyles.trumpSub}>is TRUMP</Text>
        <Text style={trStyles.trumpDot}>{SUIT_DOT[color]}</Text>
      </Animated.View>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Win Announcement Overlay
// ---------------------------------------------------------------------------

interface WinOverlayData {
  winningTeam: 0 | 1;
  team0Pts: number;
  team1Pts: number;
  bidMade: boolean;
  bidderName: string;
  bidAmount: number;
}

interface WinAnnouncementOverlayProps {
  visible: boolean;
  data: WinOverlayData | null;
  overlayOpacity: Animated.Value;
  textScale: Animated.Value;
  bannerX: Animated.Value;
  subOpacity: Animated.Value;
  onDone: () => void;
}

function WinAnnouncementOverlay({
  visible, data, overlayOpacity, textScale, bannerX, subOpacity, onDone,
}: WinAnnouncementOverlayProps) {
  if (!visible || !data) return null;
  const isUsWin = data.winningTeam === 0;
  const bannerColor = isUsWin ? '#b8860b' : '#8b0000';
  const headlineColor = isUsWin ? '#FFD700' : '#FF4444';
  const headline = isUsWin ? 'WE WON! 🎉' : 'THEY WON! 😤';

  return (
    <Modal visible={visible} transparent animationType="none">
      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          {
            backgroundColor: 'rgba(0,0,0,0.92)',
            opacity: overlayOpacity,
            alignItems: 'center',
            justifyContent: 'center',
          },
        ]}
      >
        {/* Sweeping color banner */}
        <Animated.View
          style={{
            position: 'absolute',
            left: 0, right: 0,
            height: 8,
            top: '50%',
            marginTop: 90,
            backgroundColor: bannerColor,
            opacity: 0.85,
            transform: [{ translateX: bannerX }],
          }}
        />

        {/* Headline slams in */}
        <Animated.Text
          style={{
            fontSize: 52,
            fontWeight: '900',
            color: headlineColor,
            letterSpacing: 2,
            textAlign: 'center',
            textShadowColor: headlineColor,
            textShadowOffset: { width: 0, height: 0 },
            textShadowRadius: 24,
            transform: [{ scale: textScale }],
          }}
        >
          {headline}
        </Animated.Text>

        {/* Score line */}
        <Animated.View style={{ opacity: subOpacity, alignItems: 'center', marginTop: 16 }}>
          <Text style={{
            fontSize: 28,
            fontWeight: '800',
            color: '#d8ccb0',
            letterSpacing: 1,
            textAlign: 'center',
          }}>
            US {data.team0Pts} — THEM {data.team1Pts}
          </Text>

          {/* Bid result */}
          <Text style={{
            fontSize: 22,
            fontWeight: '900',
            marginTop: 14,
            color: data.bidMade ? '#4ade80' : '#FF4444',
            letterSpacing: 2,
            textAlign: 'center',
          }}>
            {data.bidMade
              ? (data.biddingTeam === 0 ? `✅  BID MADE` : `BID MADE`)
              : `💀  BID FAILED — ${data.bidderName} goes -${data.bidAmount}`
            }
          </Text>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Enhancement 3: TrickRevealOverlay
// ---------------------------------------------------------------------------

interface TrickRevealData {
  plays: { seat: number; card: Card }[];
  winningSeat: number;
}

interface TrickRevealOverlayProps {
  data: TrickRevealData;
  onDone: () => void;
}

function TrickRevealOverlay({ data, onDone }: TrickRevealOverlayProps) {
  const { width: sw, height: sh } = Dimensions.get('window');
  const CW = 65;
  const CH = 92;
  const cx = sw / 2 - CW / 2;
  const cy = sh / 2 - CH / 2;

  const basePositions: Record<number, { x: number; y: number }> = {
    0: { x: cx,      y: cy + 100 },
    1: { x: cx - 90, y: cy       },
    2: { x: cx,      y: cy - 100 },
    3: { x: cx + 90, y: cy       },
  };

  const fanDir: Record<number, { x: number; y: number }> = {
    0: { x: 0,   y: 22  },
    1: { x: -22, y: 0   },
    2: { x: 0,   y: -22 },
    3: { x: 22,  y: 0   },
  };

  const flyDir: Record<number, { x: number; y: number }> = {
    0: { x: 0,    y: 120  },
    1: { x: -120, y: 0    },
    2: { x: 0,    y: -120 },
    3: { x: 120,  y: 0    },
  };

  const translateX = useRef<Record<number, Animated.Value>>({
    0: new Animated.Value(0),
    1: new Animated.Value(0),
    2: new Animated.Value(0),
    3: new Animated.Value(0),
  });
  const translateY = useRef<Record<number, Animated.Value>>({
    0: new Animated.Value(0),
    1: new Animated.Value(0),
    2: new Animated.Value(0),
    3: new Animated.Value(0),
  });
  const winnerScale = useRef(new Animated.Value(1));
  const winnerGlow = useRef(new Animated.Value(0));
  const allOpacity = useRef(new Animated.Value(1));

  useEffect(() => {
    const t1 = setTimeout(() => {
      Animated.parallel([
        Animated.timing(winnerScale.current, { toValue: 1.3, duration: 300, useNativeDriver: true }),
        Animated.timing(winnerGlow.current, { toValue: 1, duration: 300, useNativeDriver: false }),
      ]).start(() => {
        const fanAnims = data.plays.map(({ seat }) =>
          Animated.parallel([
            Animated.timing(translateX.current[seat], { toValue: fanDir[seat].x, duration: 200, useNativeDriver: true }),
            Animated.timing(translateY.current[seat], { toValue: fanDir[seat].y, duration: 200, useNativeDriver: true }),
          ])
        );
        Animated.parallel(fanAnims).start(() => {
          const t2 = setTimeout(() => {
            const flyAnims = data.plays.map(({ seat }) =>
              Animated.parallel([
                Animated.timing(translateX.current[seat], { toValue: flyDir[data.winningSeat].x + fanDir[seat].x, duration: 400, useNativeDriver: true }),
                Animated.timing(translateY.current[seat], { toValue: flyDir[data.winningSeat].y + fanDir[seat].y, duration: 400, useNativeDriver: true }),
              ])
            );
            Animated.parallel([
              ...flyAnims,
              Animated.timing(allOpacity.current, { toValue: 0, duration: 400, useNativeDriver: true }),
            ]).start(() => onDone());
          }, 700);
          return () => clearTimeout(t2);
        });
      });
    }, 600);

    return () => clearTimeout(t1);
  }, []);

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {data.plays.map(({ seat, card }) => {
        const pos = basePositions[seat];
        const isWinner = seat === data.winningSeat;

        const glowColor = winnerGlow.current.interpolate({
          inputRange: [0, 1],
          outputRange: ['rgba(0,0,0,0)', 'rgba(200,150,12,0.6)'],
        });

        return (
          <Animated.View
            key={seat}
            style={{
              position: 'absolute',
              left: pos.x,
              top: pos.y,
              transform: [
                { translateX: translateX.current[seat] },
                { translateY: translateY.current[seat] },
                { scale: isWinner ? winnerScale.current : 1 },
              ],
              opacity: allOpacity.current,
              zIndex: isWinner ? 10 : 5,
            }}
          >
            {isWinner && (
              <Animated.View
                style={{
                  position: 'absolute',
                  top: -6, left: -6, right: -6, bottom: -6,
                  borderRadius: 14,
                  backgroundColor: glowColor,
                  borderWidth: 2.5,
                  borderColor: C.gold,
                }}
              />
            )}
            <PlayingCard card={card} size="play" valid winner={isWinner} />
          </Animated.View>
        );
      })}
    </View>
  );
}

// ---------------------------------------------------------------------------
// AnimatedTrickSlot
// ---------------------------------------------------------------------------

interface AnimatedTrickSlotProps {
  seat: number;
  seatName: string;
  card: Card | undefined;
  animIn: { opacity: Animated.Value; scale: Animated.Value };
  clearAnim: Animated.Value;
  clearTranslate: Animated.Value;
}

function AnimatedTrickSlot({ seat, seatName, card, animIn, clearAnim, clearTranslate }: AnimatedTrickSlotProps) {
  const clearStyle = seat === 0
    ? { opacity: clearAnim, transform: [{ translateY: clearTranslate }] }
    : seat === 2
    ? { opacity: clearAnim, transform: [{ translateY: Animated.multiply(clearTranslate, new Animated.Value(-1)) }] }
    : seat === 1
    ? { opacity: clearAnim, transform: [{ translateX: Animated.multiply(clearTranslate, new Animated.Value(-1)) }] }
    : { opacity: clearAnim, transform: [{ translateX: clearTranslate }] };

  const glowScale = useRef(new Animated.Value(0)).current;
  const glowOpacity = useRef(new Animated.Value(0)).current;
  const prevCardId = useRef<string | null>(null);

  useEffect(() => {
    const newId = card?.id ?? null;
    if (newId && newId !== prevCardId.current) {
      prevCardId.current = newId;
      glowScale.setValue(0.6);
      glowOpacity.setValue(0.5);
      Animated.parallel([
        Animated.timing(glowScale, { toValue: 1.5, duration: 350, useNativeDriver: true }),
        Animated.timing(glowOpacity, { toValue: 0, duration: 350, useNativeDriver: true }),
      ]).start();
    } else if (!newId) {
      prevCardId.current = null;
    }
  }, [card?.id]);

  return (
    <View style={[styles.trickSlot, { position: 'relative' }]} key={seat}>
      <Text style={styles.trickSeatLabel}>{seatName}</Text>
      {card ? (
        <Animated.View
          style={[
            { opacity: animIn.opacity, transform: [{ scale: animIn.scale }] },
            clearStyle,
          ]}
        >
          {/* Glow burst ring */}
          <Animated.View pointerEvents="none" style={{
            position: 'absolute', top: '50%', left: '50%',
            width: 70, height: 90,
            marginTop: -45, marginLeft: -35,
            borderRadius: 10,
            borderWidth: 3,
            borderColor: C.gold,
            opacity: glowOpacity,
            transform: [{ scale: glowScale }],
            zIndex: 10,
          }} />
          <PlayingCard card={card} size="play" valid />
        </Animated.View>
      ) : (
        <View style={styles.trickEmpty}>
          <Text style={styles.trickEmptyDot}>·</Text>
        </View>
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------

interface Props {
  onBack: () => void;
  difficulty: Difficulty;
}

interface HandResult {
  team0: number;
  team1: number;
  bidMade: boolean;
  winningTeam: 0 | 1;
  winningCards: Card[];
  bidderName: string;
  bidAmount: number;
  biddingTeam: 0 | 1;
}

// Helpers
function computeTrickPts(
  completedTricks: GameState['completedTricks'],
  teamSeats: Set<number>
): number {
  return completedTricks.reduce((sum, trick) => {
    if (trick.winningSeat != null && teamSeats.has(trick.winningSeat)) {
      return sum + trick.plays.reduce((pts, p) => pts + p.card.points, 0);
    }
    return sum;
  }, 0);
}

function countTeamTricks(
  completedTricks: GameState['completedTricks'],
  teamSeats: Set<number>
): number {
  return completedTricks.filter(
    t => t.winningSeat != null && teamSeats.has(t.winningSeat)
  ).length;
}

const TEAM0_SEATS = new Set([0, 2]);
const TEAM1_SEATS = new Set([1, 3]);

// ---------------------------------------------------------------------------
// DramaticScoreModal — exciting hand score reveal
// ---------------------------------------------------------------------------

interface DramaticScoreModalProps {
  visible: boolean;
  handResult: HandResult | null;
  scores: number[];
  onNextHand: () => void;
  onBack: () => void;
  phase: string;
  winner: number | undefined;
  displayScore0: number;
  displayScore1: number;
  setDisplayScore0: (v: number) => void;
  setDisplayScore1: (v: number) => void;
  bannerScale: Animated.Value;
  bgAnim: Animated.Value;
  majorityX: Animated.Value;
  nextHandPulse: Animated.Value;
  countIntervalRef: React.MutableRefObject<ReturnType<typeof setInterval> | null>;
}

function DramaticScoreModal({
  visible, handResult, scores, onNextHand, onBack, phase, winner,
  displayScore0, displayScore1, setDisplayScore0, setDisplayScore1,
  bannerScale, bgAnim, majorityX, nextHandPulse, countIntervalRef,
}: DramaticScoreModalProps) {
  const team0FadeAnim = useRef(new Animated.Value(0)).current;
  const team1FadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible || !handResult) return;

    // Reset all
    bannerScale.setValue(0);
    bgAnim.setValue(0);
    majorityX.setValue(300);
    nextHandPulse.setValue(1);
    team0FadeAnim.setValue(0);
    team1FadeAnim.setValue(0);
    setDisplayScore0(0);
    setDisplayScore1(0);
    if (countIntervalRef.current) clearInterval(countIntervalRef.current);

    // Banner slams in: scale 0 → 1.3 → 1.0
    Animated.sequence([
      Animated.timing(bannerScale, { toValue: 1.3, duration: 250, useNativeDriver: true }),
      Animated.timing(bannerScale, { toValue: 1.0, duration: 150, useNativeDriver: true }),
    ]).start();

    // Background pulse
    Animated.sequence([
      Animated.timing(bgAnim, { toValue: 1, duration: 300, useNativeDriver: false }),
      Animated.timing(bgAnim, { toValue: 0.4, duration: 500, useNativeDriver: false }),
    ]).start();

    // Team score rows fade in with stagger
    setTimeout(() => {
      Animated.timing(team0FadeAnim, { toValue: 1, duration: 300, useNativeDriver: true }).start();
    }, 350);
    setTimeout(() => {
      Animated.timing(team1FadeAnim, { toValue: 1, duration: 300, useNativeDriver: true }).start();
    }, 550);

    // Count up scores like a slot machine
    const target0 = Math.abs(handResult.team0);
    const target1 = Math.abs(handResult.team1);
    const maxTarget = Math.max(target0, target1, 1);
    let cur0 = 0;
    let cur1 = 0;
    setTimeout(() => {
      countIntervalRef.current = setInterval(() => {
        const step = Math.ceil(maxTarget / 30);
        cur0 = Math.min(cur0 + step, target0);
        cur1 = Math.min(cur1 + step, target1);
        setDisplayScore0(cur0);
        setDisplayScore1(cur1);
        if (cur0 >= target0 && cur1 >= target1) {
          if (countIntervalRef.current) clearInterval(countIntervalRef.current);
          countIntervalRef.current = null;
          // Slide in majority bonus line
          setTimeout(() => {
            Animated.timing(majorityX, { toValue: 0, duration: 400, useNativeDriver: true }).start();
          }, 200);
        }
      }, 30);
    }, 600);

    // Next hand button pulse loop after 2s
    const pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(nextHandPulse, { toValue: 1.1, duration: 500, useNativeDriver: true }),
        Animated.timing(nextHandPulse, { toValue: 1.0, duration: 500, useNativeDriver: true }),
      ])
    );
    const pulseTimer = setTimeout(() => pulseLoop.start(), 2000);

    return () => {
      if (countIntervalRef.current) clearInterval(countIntervalRef.current);
      pulseLoop.stop();
      clearTimeout(pulseTimer);
    };
  }, [visible, handResult]);

  if (!handResult) return null;

  const bgColor = bgAnim.interpolate({
    inputRange: [0, 1],
    outputRange: handResult.bidMade
      ? ['rgba(13,26,13,1)', 'rgba(70,50,0,1)']
      : ['rgba(13,26,13,1)', 'rgba(70,0,0,1)'],
  });

  const oldScore0 = scores[0] - handResult.team0;
  const oldScore1 = scores[1] - handResult.team1;
  const sign0 = handResult.team0 >= 0 ? '+' : '';
  const sign1 = handResult.team1 >= 0 ? '+' : '';

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.modalOverlay}>
        <ScrollView contentContainerStyle={styles.modalScrollContent} showsVerticalScrollIndicator={false}>
          <Animated.View style={[styles.modalBox, { backgroundColor: bgColor }]}>

            {/* BID MADE / BID FAILED banner */}
            <Animated.Text style={[dmStyles.bidResultText, {
              transform: [{ scale: bannerScale }],
              color: handResult.bidMade ? '#FFD700' : '#FF4444',
              textShadowColor: handResult.bidMade ? 'rgba(255,215,0,0.5)' : 'rgba(255,0,0,0.4)',
              textShadowOffset: { width: 0, height: 0 },
              textShadowRadius: 16,
            }]}>
              {handResult.bidMade
                ? (handResult.biddingTeam === 0 ? 'BID MADE! 🎉' : 'BID MADE')
                : 'BID FAILED! 💀'}
            </Animated.Text>

            {/* Team won text */}
            <Text style={[dmStyles.teamWonText, { color: handResult.bidMade ? C.gold : '#FF8888' }]}>
            </Text>

            <Text style={[styles.modalLine, { marginBottom: 12 }]}>
              Bid: {handResult.bidAmount} by {handResult.bidderName}
            </Text>

            {/* Team 0 score — fades in first */}
            <Animated.View style={[
              dmStyles.teamScoreRow,
              { opacity: team0FadeAnim },
              handResult.winningTeam === 0 && dmStyles.teamScoreRowWinner,
            ]}>
              <Text style={dmStyles.teamScoreLabel}>👥 Your Team</Text>
              <Text style={[dmStyles.teamScoreCount, { color: '#FFD700' }]}>
                {sign0}{displayScore0}
              </Text>
            </Animated.View>

            {/* Team 1 score — fades in after 200ms stagger */}
            <Animated.View style={[
              dmStyles.teamScoreRow,
              { opacity: team1FadeAnim },
              handResult.winningTeam === 1 && dmStyles.teamScoreRowWinner,
            ]}>
              <Text style={dmStyles.teamScoreLabel}>🤖 CPU Team</Text>
              <Text style={[dmStyles.teamScoreCount, { color: '#FF8888' }]}>
                {sign1}{displayScore1}
              </Text>
            </Animated.View>

            {/* Majority bonus slides in from right */}
            <Animated.View style={[dmStyles.majorityRow, { transform: [{ translateX: majorityX }] }]}>
              <Text style={dmStyles.majorityText}>+ 20 MAJORITY BONUS ★</Text>
            </Animated.View>

            {/* Game score: old → new */}
            <View style={dmStyles.gameScoreSection}>
              <Text style={dmStyles.gameScoreLabel}>GAME SCORE</Text>
              <View style={dmStyles.gameScoreArrows}>
                <View style={dmStyles.gameScoreCol}>
                  <Text style={dmStyles.gameScoreTeam}>Us</Text>
                  <Text style={dmStyles.gameScoreArrow}>
                    {oldScore0} → {scores[0]}
                  </Text>
                </View>
                <View style={dmStyles.gameScoreCol}>
                  <Text style={dmStyles.gameScoreTeam}>Them</Text>
                  <Text style={dmStyles.gameScoreArrow}>
                    {oldScore1} → {scores[1]}
                  </Text>
                </View>
              </View>
            </View>

            {phase === 'gameOver' && (
              <Text style={styles.modalWinner}>
                {winner === 0 ? '🏆 Your team wins the game!' : '😞 CPU team wins the game!'}
              </Text>
            )}

            <View style={styles.modalBtns}>
              {phase !== 'gameOver' && (
                <Animated.View style={{ transform: [{ scale: nextHandPulse }] }}>
                  <TouchableOpacity
                    style={[styles.actionBtn, styles.actionBtnPrimary, dmStyles.nextHandBtn]}
                    onPress={onNextHand}
                  >
                    <Text style={[styles.actionBtnText, styles.actionBtnTextPrimary, dmStyles.nextHandBtnText]}>
                      NEXT HAND ▶
                    </Text>
                  </TouchableOpacity>
                </Animated.View>
              )}
              <TouchableOpacity style={styles.actionBtn} onPress={onBack}>
                <Text style={styles.actionBtnText}>End Game</Text>
              </TouchableOpacity>
            </View>
          </Animated.View>
        </ScrollView>
      </View>
    </Modal>
  );
}

export default function GameBoardScreen({ onBack, difficulty }: Props) {
  const [state, setState] = useState<GameState>(() => {
    const s = createGame(['You', 'CPU 1', 'CPU 2', 'CPU 3'], [0]);
    return startDeal(s);
  });

  const [status, setStatus] = useState<string>('Bidding begins! You go first.');
  const [selectedDiscard, setSelectedDiscard] = useState<Set<string>>(new Set());
  const [showScoreModal, setShowScoreModal] = useState(false);
  const [handResult, setHandResult] = useState<HandResult | null>(null);
  const [playingCardId, setPlayingCardId] = useState<string | null>(null);

  // Live scoreboard
  const [handPoints, setHandPoints] = useState<[number, number]>([0, 0]);
  const scoreScaleAnims = useRef([new Animated.Value(1), new Animated.Value(1)]);
  const scoreColorAnims = useRef([new Animated.Value(0), new Animated.Value(0)]);

  // Screen shake
  const shakeAnim = useRef(new Animated.Value(0));

  // Particles
  const particleAnims = useRef<ParticleState[]>(
    Array.from({ length: NUM_PARTICLES }, () => ({
      x: new Animated.Value(0),
      y: new Animated.Value(0),
      opacity: new Animated.Value(0),
      color: C.gold,
    }))
  );
  const [particlesActive, setParticlesActive] = useState(false);
  const [particleTrump, setParticleTrump] = useState<Color | null>(null);

  // Enhancement 1: bidding modal state
  const [bidLog, setBidLog] = useState<string[]>([]);
  const [biddingModalVisible, setBiddingModalVisible] = useState(true);
  const biddingModalSlide = useRef(new Animated.Value(0));
  const biddingModalOpacity = useRef(new Animated.Value(1));
  const biddingPulse = useRef(new Animated.Value(1));
  const shimmerAnim = useRef(new Animated.Value(0));

  // Enhancement 2: trump reveal
  const [showTrumpReveal, setShowTrumpReveal] = useState(false);
  const [trumpRevealColor, setTrumpRevealColor] = useState<Color | null>(null);
  const trumpRevealOpacity = useRef(new Animated.Value(0));
  const trumpTextScale = useRef(new Animated.Value(0.3));
  const trumpBannerX = useRef(new Animated.Value(-500));
  const trumpHeaderPulse = useRef(new Animated.Value(1));
  const pendingStateRef = useRef<GameState | null>(null);

  // Enhancement 3: trick reveal overlay
  const [trickReveal, setTrickReveal] = useState<TrickRevealData | null>(null);
  const pendingTrickStateRef = useRef<GameState | null>(null);

  // Enhanced scoring modal — dramatic reveal
  const scoreModalBannerScale = useRef(new Animated.Value(0));
  const scoreModalBgAnim = useRef(new Animated.Value(0));
  const scoreModalMajorityX = useRef(new Animated.Value(300));
  const scoreModalNextHandPulse = useRef(new Animated.Value(1));
  const [displayScore0, setDisplayScore0] = useState(0);
  const [displayScore1, setDisplayScore1] = useState(0);
  const scoreCountIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Felt flash for trick winner
  const feltFlashAnim = useRef(new Animated.Value(0));
  const [feltFlashTeam, setFeltFlashTeam] = useState<0 | 1>(0);

  // Winner float text
  const winnerFloatY = useRef(new Animated.Value(0));
  const winnerFloatOpacity = useRef(new Animated.Value(0));
  const [winnerFloatText, setWinnerFloatText] = useState('');

  // Win announcement overlay
  const [showWinOverlay, setShowWinOverlay] = useState(false);
  const [winOverlayData, setWinOverlayData] = useState<WinOverlayData | null>(null);
  const winOverlayOpacity = useRef(new Animated.Value(0));
  const winOverlayTextScale = useRef(new Animated.Value(0.2));
  const winOverlayBannerX = useRef(new Animated.Value(-600));
  const winOverlaySubOpacity = useRef(new Animated.Value(0));
  const pendingHandStateRef = useRef<GameState | null>(null);

  // Card play ripple
  const rippleScale = useRef(new Animated.Value(0));
  const rippleOpacity = useRef(new Animated.Value(0));
  const [rippleVisible, setRippleVisible] = useState(false);

  // Existing animation refs
  const trickCardAnims = useRef<{ [seat: number]: { opacity: Animated.Value; scale: Animated.Value } }>({
    0: { opacity: new Animated.Value(0), scale: new Animated.Value(0.5) },
    1: { opacity: new Animated.Value(0), scale: new Animated.Value(0.5) },
    2: { opacity: new Animated.Value(0), scale: new Animated.Value(0.5) },
    3: { opacity: new Animated.Value(0), scale: new Animated.Value(0.5) },
  });
  const trickClearAnim = useRef(new Animated.Value(1));
  const trickClearTranslate = useRef(new Animated.Value(0));
  const prevTrickPlaysRef = useRef<Set<number>>(new Set());
  const prevCompletedCountRef = useRef(0);
  const stateRef = useRef(state);
  stateRef.current = state;

  // ── Screen shake helper ──
  function triggerShake(count: number = 1) {
    const singleShake = () =>
      Animated.sequence([
        Animated.timing(shakeAnim.current, { toValue: -6, duration: 40, useNativeDriver: true }),
        Animated.timing(shakeAnim.current, { toValue: 6,  duration: 40, useNativeDriver: true }),
        Animated.timing(shakeAnim.current, { toValue: -4, duration: 40, useNativeDriver: true }),
        Animated.timing(shakeAnim.current, { toValue: 4,  duration: 40, useNativeDriver: true }),
        Animated.timing(shakeAnim.current, { toValue: -2, duration: 40, useNativeDriver: true }),
        Animated.timing(shakeAnim.current, { toValue: 2,  duration: 40, useNativeDriver: true }),
        Animated.timing(shakeAnim.current, { toValue: 0,  duration: 40, useNativeDriver: true }),
      ]);
    const seq: Animated.CompositeAnimation[] = [];
    for (let i = 0; i < count; i++) seq.push(singleShake());
    Animated.sequence(seq).start();
  }

  function triggerSoftShake() {
    Animated.sequence([
      Animated.timing(shakeAnim.current, { toValue: -3, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim.current, { toValue: 3,  duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim.current, { toValue: -1, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim.current, { toValue: 0,  duration: 50, useNativeDriver: true }),
    ]).start();
  }

  // ── Score animation helper ──
  function animateScore(team: 0 | 1) {
    const scaleAnim = scoreScaleAnims.current[team];
    const colorAnim = scoreColorAnims.current[team];
    Animated.sequence([
      Animated.parallel([
        Animated.timing(scaleAnim, { toValue: 1.6, duration: 150, useNativeDriver: true }),
        Animated.timing(colorAnim, { toValue: 1, duration: 150, useNativeDriver: false }),
      ]),
      Animated.parallel([
        Animated.timing(scaleAnim, { toValue: 1.0, duration: 150, useNativeDriver: true }),
        Animated.timing(colorAnim, { toValue: 0, duration: 150, useNativeDriver: false }),
      ]),
    ]).start();
  }

  // ── Particle burst helper ──
  function triggerParticles(trump: Color | null) {
    setParticleTrump(trump);
    const trumpColor = trump ? TRUMP_COLORS[trump] : C.gold;
    const colors = [C.gold, trumpColor, C.gold, trumpColor, C.gold, trumpColor,
                    C.gold, trumpColor, C.gold, trumpColor, C.gold, trumpColor];

    particleAnims.current.forEach((p, i) => {
      p.color = colors[i % colors.length];
      p.x.setValue(0);
      p.y.setValue(0);
      p.opacity.setValue(1);
    });

    const angleStep = (2 * Math.PI) / NUM_PARTICLES;
    const anims = particleAnims.current.map((p, i) => {
      const angle = i * angleStep + (Math.random() - 0.5) * 0.4;
      const dist = 60 + Math.random() * 60;
      const tx = Math.cos(angle) * dist;
      const ty = Math.sin(angle) * dist;
      return Animated.parallel([
        Animated.timing(p.x, { toValue: tx, duration: 500, useNativeDriver: true }),
        Animated.timing(p.y, { toValue: ty, duration: 500, useNativeDriver: true }),
        Animated.timing(p.opacity, { toValue: 0, duration: 500, useNativeDriver: true }),
      ]);
    });

    setParticlesActive(true);
    Animated.parallel(anims).start(() => setParticlesActive(false));
  }

  // ── Enhancement 1: bidding shimmer & pulse ──
  useEffect(() => {
    if (state.phase === 'bidding') {
      const shimmerLoop = Animated.loop(
        Animated.sequence([
          Animated.timing(shimmerAnim.current, { toValue: 1, duration: 1500, useNativeDriver: false }),
          Animated.timing(shimmerAnim.current, { toValue: 0, duration: 1500, useNativeDriver: false }),
        ])
      );
      shimmerLoop.start();

      const pulseLoop = Animated.loop(
        Animated.sequence([
          Animated.timing(biddingPulse.current, { toValue: 1.08, duration: 800, useNativeDriver: true }),
          Animated.timing(biddingPulse.current, { toValue: 1.0,  duration: 800, useNativeDriver: true }),
        ])
      );
      pulseLoop.start();

      return () => {
        shimmerLoop.stop();
        pulseLoop.stop();
      };
    } else if (biddingModalVisible) {
      Animated.parallel([
        Animated.timing(biddingModalSlide.current, { toValue: 900, duration: 420, useNativeDriver: true }),
        Animated.timing(biddingModalOpacity.current, { toValue: 0, duration: 420, useNativeDriver: true }),
      ]).start(() => {
        setBiddingModalVisible(false);
        biddingModalSlide.current.setValue(0);
        biddingModalOpacity.current.setValue(1);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.phase]);

  // ── Trick card entrance animations ──
  useEffect(() => {
    if (trickReveal) return;
    const currentPlays = state.currentTrick?.plays ?? [];
    const currentSeats = new Set(currentPlays.map(p => p.seat));
    currentSeats.forEach(seat => {
      if (!prevTrickPlaysRef.current.has(seat)) {
        const a = trickCardAnims.current[seat];
        a.opacity.setValue(0);
        a.scale.setValue(0.5);
        Animated.parallel([
          Animated.timing(a.opacity, { toValue: 1, duration: 250, useNativeDriver: true }),
          Animated.timing(a.scale,   { toValue: 1, duration: 250, useNativeDriver: true }),
        ]).start();
      }
    });
    prevTrickPlaysRef.current = currentSeats;
  }, [state.currentTrick?.plays, trickReveal]);

  // ── Trick clear animation ──
  useEffect(() => {
    const newCount = state.completedTricks.length;
    if (newCount > prevCompletedCountRef.current && prevCompletedCountRef.current > 0 && !trickReveal) {
      trickClearAnim.current.setValue(1);
      trickClearTranslate.current.setValue(0);
      Animated.parallel([
        Animated.timing(trickClearAnim.current,      { toValue: 0,  duration: 400, useNativeDriver: true }),
        Animated.timing(trickClearTranslate.current, { toValue: 30, duration: 400, useNativeDriver: true }),
      ]).start(() => {
        trickClearAnim.current.setValue(1);
        trickClearTranslate.current.setValue(0);
        Object.values(trickCardAnims.current).forEach(a => {
          a.opacity.setValue(0);
          a.scale.setValue(0.5);
        });
      });
    }
    prevCompletedCountRef.current = newCount;
  }, [state.completedTricks.length, trickReveal]);

  // ── Trump reveal animation helper ──
  function fireTrumpReveal(color: Color, nextGameState: GameState) {
    pendingStateRef.current = nextGameState;
    stateRef.current = nextGameState;
    setTrumpRevealColor(color);
    setShowTrumpReveal(true);

    trumpRevealOpacity.current.setValue(0);
    trumpTextScale.current.setValue(0.3);
    trumpBannerX.current.setValue(-500);

    Animated.timing(trumpRevealOpacity.current, { toValue: 1, duration: 300, useNativeDriver: true }).start();
    Animated.sequence([
      Animated.timing(trumpTextScale.current, { toValue: 1.2, duration: 350, useNativeDriver: true }),
      Animated.timing(trumpTextScale.current, { toValue: 1.0, duration: 250, useNativeDriver: true }),
    ]).start();

    setTimeout(() => {
      Animated.timing(trumpBannerX.current, { toValue: 0, duration: 420, useNativeDriver: true }).start();
    }, 300);

    setTimeout(() => {
      Animated.timing(trumpRevealOpacity.current, { toValue: 0, duration: 350, useNativeDriver: true }).start(() => {
        setShowTrumpReveal(false);
        const ps = pendingStateRef.current;
        if (ps) {
          pendingStateRef.current = null;
          setState(ps);
          stateRef.current = ps;
        }
        Animated.sequence([
          Animated.timing(trumpHeaderPulse.current, { toValue: 1.5, duration: 200, useNativeDriver: true }),
          Animated.timing(trumpHeaderPulse.current, { toValue: 1.0, duration: 200, useNativeDriver: true }),
        ]).start();
      });
    }, 2200);
  }

  // ── Trick reveal done callback ──
  function onTrickRevealDone() {
    setTrickReveal(null);
    Object.values(trickCardAnims.current).forEach(a => {
      a.opacity.setValue(0);
      a.scale.setValue(0.5);
    });
    prevTrickPlaysRef.current = new Set();
    const ps = pendingTrickStateRef.current;
    if (ps) {
      pendingTrickStateRef.current = null;
      setState(ps);
      stateRef.current = ps;
      if (!ps.players[ps.activePlayer]?.isHuman && ps.phase === 'playing') {
        runAI(ps);
      }
    }
  }

  // ── Bid log helper ──
  function addBidLog(entry: string) {
    setBidLog(prev => [...prev, entry].slice(-3));
  }

  // ── Handle trick completion ──
  function handleTrickComplete(next: GameState, current: GameState) {
    const lastTrick = next.completedTricks[next.completedTricks.length - 1];
    const winner = next.players[lastTrick.winningSeat!];
    setStatus(`${winner.name === 'You' ? 'You won' : winner.name + ' won'} the trick!`);

    // Update running hand points + animate
    const newT0 = computeTrickPts(next.completedTricks, TEAM0_SEATS);
    const newT1 = computeTrickPts(next.completedTricks, TEAM1_SEATS);
    const oldT0 = computeTrickPts(current.completedTricks, TEAM0_SEATS);
    const oldT1 = computeTrickPts(current.completedTricks, TEAM1_SEATS);
    if (newT0 > oldT0) animateScore(0);
    if (newT1 > oldT1) animateScore(1);
    setHandPoints([newT0, newT1]);

    // Particle burst when human player wins
    if (lastTrick.winningSeat === 0) {
      triggerParticles(next.trump ?? null);
    }

    // Felt flash + winner float text
    const winTeam: 0 | 1 = TEAM0_SEATS.has(lastTrick.winningSeat!) ? 0 : 1;
    setFeltFlashTeam(winTeam);
    feltFlashAnim.current.setValue(0);
    Animated.sequence([
      Animated.timing(feltFlashAnim.current, { toValue: 0.5, duration: 150, useNativeDriver: false }),
      Animated.timing(feltFlashAnim.current, { toValue: 0, duration: 550, useNativeDriver: false }),
    ]).start();
    // Float text — bigger, includes team name
    const floatName = winTeam === 0
      ? (winner.name === 'You' ? 'YOU WIN THE TRICK!' : `${winner.name} WINS!`)
      : `${winner.name} WINS!`;
    setWinnerFloatText(floatName);
    winnerFloatY.current.setValue(0);
    winnerFloatOpacity.current.setValue(1);
    Animated.parallel([
      Animated.timing(winnerFloatY.current, { toValue: -55, duration: 900, useNativeDriver: true }),
      Animated.timing(winnerFloatOpacity.current, { toValue: 0, duration: 900, useNativeDriver: true }),
    ]).start();

    // Shake when our team banks points from a trick
    const trickHasPoints = lastTrick.plays.some(p => p.card.points > 0);
    const rookWon = lastTrick.plays.some(p => p.card.value === 'Rook') && TEAM0_SEATS.has(lastTrick.winningSeat!);
    if (rookWon) {
      triggerShake(1);
    } else if (TEAM0_SEATS.has(lastTrick.winningSeat!) && trickHasPoints) {
      triggerSoftShake();
    }

    if (next.phase === 'scoring' || next.phase === 'gameOver') {
      // Check if bidding team went SET
      try {
        const result = scoreHand(next);
        if (!result.bidMade) triggerShake(3);
      } catch {
        // ignore
      }
      if (next.phase === 'gameOver') triggerShake(2);
      setState(next);
      stateRef.current = next;
      showHandResult(next);
      return;
    }

    // Queue trick reveal overlay
    pendingTrickStateRef.current = next;
    stateRef.current = next;
    setTrickReveal({
      plays: lastTrick.plays,
      winningSeat: lastTrick.winningSeat!,
    });
    Object.values(trickCardAnims.current).forEach(a => a.opacity.setValue(0));
  }

  // ── AI ──
  const runAI = useCallback((s: GameState) => {
    const seat = s.activePlayer;
    const player = s.players[seat];
    if (player.isHuman) return;

    const delay = s.phase === 'playing' ? 1400 : 1800;

    setTimeout(() => {
      const current = stateRef.current;
      if (current.phase !== s.phase || current.activePlayer !== seat) return;

      try {
        if (current.phase === 'bidding') {
          const action = getAIAction(current, seat, difficulty);
          const team = seat % 2 === 0 ? 'Us' : 'Them';
          if (action === 'pass') {
            addBidLog(`${player.name} (${team}): PASS`);
          } else {
            addBidLog(`${player.name} (${team}): ${action}`);
          }
          const next = bid(current, seat, action);

          if (next.phase === 'widow') {
            if (!next.players[next.activePlayer].isHuman) {
              handleAIWidow(next);
            } else {
              // Human won the bid — pick up widow and let them discard
              const widowNext = pickUpWidow(next);
              setState(widowNext);
              stateRef.current = widowNext;
              setStatus('Pick 5 non-point cards to discard. (' + widowNext.players[0].hand.length + ' cards)');
            }
            return;
          }

          setState(next);
          stateRef.current = next;

          if (!next.players[next.activePlayer]?.isHuman && next.phase === 'bidding') {
            runAI(next);
          }
        } else if (current.phase === 'playing') {
          const action = getAIAction(current, seat, difficulty);
          const card = action as Card;
          setStatus(`${player.name} played ${card.color !== 'Rook' ? card.value : 'Rook'} ${SUIT_DOT[card.color]}.`);
          const next = playCard(current, seat, card);

          if (next.completedTricks.length > current.completedTricks.length) {
            handleTrickComplete(next, current);
            return;
          }

          setState(next);
          stateRef.current = next;

          if (!next.players[next.activePlayer]?.isHuman && next.phase === 'playing') {
            runAI(next);
          }
        }
      } catch (e) {
        console.warn('AI error:', e);
      }
    }, delay);
  }, []);

  function handleAIWidow(s: GameState) {
    const seat = s.activePlayer;
    let next = pickUpWidow(s);
    stateRef.current = next;
    const discards = getAIAction(next, seat, difficulty) as Card[];
    next = discardToWidow(next, seat, discards);
    stateRef.current = next;
    const trump = getAIAction(next, seat, difficulty) as Color;
    setStatus(`${s.players[seat].name} calls ${trump} trump.`);
    const finalState = callTrump(next, seat, trump);
    fireTrumpReveal(trump, finalState);
  }

  useEffect(() => {
    const s = state;
    if (s.phase === 'bidding' && !s.players[s.activePlayer].isHuman) {
      runAI(s);
    } else if (s.phase === 'playing' && !s.players[s.activePlayer].isHuman) {
      runAI(s);
    } else if (s.phase === 'widow' && !s.players[s.activePlayer].isHuman) {
      handleAIWidow(s);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.phase, state.activePlayer]);

  // ── Win announcement overlay ──


  // ── Score result helper ──
  function showHandResult(s: GameState) {
    try {
      const result = scoreHand(s);
      const winningTeam: 0 | 1 = result.team0Score >= result.team1Score ? 0 : 1;
      const winningSeats = winningTeam === 0 ? TEAM0_SEATS : TEAM1_SEATS;
      const winningCards: Card[] = [];
      s.completedTricks.forEach(trick => {
        if (trick.winningSeat != null && winningSeats.has(trick.winningSeat)) {
          trick.plays.forEach(play => winningCards.push(play.card));
        }
      });
      winningCards.sort((a, b) => b.points - a.points);
      const bidderSeat = s.bidState?.currentBidder ?? 0;
      const bidderName = s.players[bidderSeat]?.name ?? 'Unknown';
      const biddingTeam: 0 | 1 = bidderSeat % 2 === 0 ? 0 : 1;
      setHandResult({
        team0: result.team0Score,
        team1: result.team1Score,
        bidMade: result.bidMade,
        winningTeam,
        winningCards,
        bidderName,
        bidAmount: s.bidState?.currentBid ?? 0,
        biddingTeam,
      });
    } catch {
      setHandResult({ team0: 0, team1: 0, bidMade: true, winningTeam: 0, winningCards: [], bidderName: 'Unknown', bidAmount: 0, biddingTeam: 0 });
    }
    setShowScoreModal(true);
  }

  // ── Human actions ──
  function humanBid(amount: number | 'pass') {
    if (state.phase !== 'bidding' || state.activePlayer !== 0) return;
    try {
      const entry = amount === 'pass' ? 'You passed' : `You bid ${amount}`;
      const yourTeam = 'Us';
      addBidLog(amount === 'pass' ? `You (${yourTeam}): PASS` : `You (${yourTeam}): ${amount}`);
      addBidLog(entry);
      const next = bid(state, 0, amount);

      if (next.phase === 'widow' && next.players[next.activePlayer].isHuman) {
        const widowNext = pickUpWidow(next);
        setState(widowNext);
        stateRef.current = widowNext;
        setStatus('Pick 5 non-point cards to discard. (' + widowNext.players[0].hand.length + ' cards)');
      } else {
        setState(next);
        stateRef.current = next;
      }
    } catch (e: unknown) {
      setStatus((e as Error).message ?? 'Invalid bid.');
    }
  }

  function humanDiscard() {
    if (selectedDiscard.size !== 5) {
      setStatus(`Select exactly 5 cards to discard (${selectedDiscard.size}/5 selected).`);
      return;
    }
    const currentState = stateRef.current;
    const cards = currentState.players[0].hand.filter(c => selectedDiscard.has(c.id));
    try {
      const next = discardToWidow(currentState, 0, cards);
      setSelectedDiscard(new Set());
      setState(next);
      setStatus('Now choose your trump color.');
    } catch (e: unknown) {
      setStatus((e as Error).message ?? 'Invalid discard.');
    }
  }

  function humanCallTrump(color: Color) {
    if (state.phase !== 'trump' || state.activePlayer !== 0) return;
    const next = callTrump(state, 0, color);
    setStatus(`You called ${color} trump. You lead!`);
    fireTrumpReveal(color, next);
  }

  function humanPlayCard(card: Card) {
    if (state.phase !== 'playing' || state.activePlayer !== 0) return;
    const validPlays = getValidPlays(state, 0);
    if (!validPlays.find(c => c.id === card.id)) return;

    setPlayingCardId(card.id);
    // Ripple when card lands (after lift delay)
    setTimeout(() => {
      rippleScale.current.setValue(0);
      rippleOpacity.current.setValue(0.7);
      setRippleVisible(true);
      Animated.parallel([
        Animated.timing(rippleScale.current, { toValue: 1, duration: 300, useNativeDriver: true }),
        Animated.timing(rippleOpacity.current, { toValue: 0, duration: 300, useNativeDriver: true }),
      ]).start(() => setRippleVisible(false));
    }, 100);
    setTimeout(() => {
      setPlayingCardId(null);
      try {
        const label = card.color !== 'Rook' ? `${card.value} ${SUIT_DOT[card.color]}` : 'Rook 🐦';
        setStatus(`You played ${label}.`);
        const next = playCard(state, 0, card);

        if (next.completedTricks.length > state.completedTricks.length) {
          handleTrickComplete(next, state);
          return;
        }

        setState(next);
      } catch (e: unknown) {
        setStatus((e as Error).message ?? 'Invalid play.');
      }
    }, 250);
  }

  function toggleDiscard(card: Card) {
    if (card.points > 0) { setStatus('Cannot discard point cards!'); return; }
    setSelectedDiscard(prev => {
      const next = new Set(prev);
      if (next.has(card.id)) next.delete(card.id);
      else if (next.size < 5) next.add(card.id);
      else setStatus('Already selected 5 cards to discard.');
      return next;
    });
  }

  function nextHand() {
    setShowScoreModal(false);
    setHandResult(null);
    setBidLog([]);
    setBiddingModalVisible(true);
    setHandPoints([0, 0]);
    biddingModalSlide.current.setValue(0);
    biddingModalOpacity.current.setValue(1);
    prevCompletedCountRef.current = 0;
    prevTrickPlaysRef.current = new Set();
    const next = startDeal(state);
    setState(next);
    setStatus('New hand dealt. Bidding begins!');
  }

  // ── Render ──
  const { phase, activePlayer, bidState, trump, scores, players, currentTrick, completedTricks } = state;
  const dealer = bidState.dealer;
  const leadSeat = currentTrick && currentTrick.plays.length > 0 ? currentTrick.plays[0].seat : null;
  const humanHand = players[0].hand;
  const validPlays = phase === 'playing' && activePlayer === 0 ? getValidPlays(state, 0) : [];
  const validIds = new Set(validPlays.map(c => c.id));

  const isDiscard = phase === 'widow' && activePlayer === 0;
  const isTrump   = phase === 'trump' && activePlayer === 0;
  const seatNames = players.map(p => p.name);

  // Determine bidding team (team of currentBidder)
  const biddingTeamNum: number | null = bidState.currentBid > 0
    ? (TEAM0_SEATS.has(bidState.currentBidder) ? 0 : 1)
    : null;

  const handTricks: [number, number] = [
    countTeamTricks(completedTricks, TEAM0_SEATS),
    countTeamTricks(completedTricks, TEAM1_SEATS),
  ];

  function renderTrickSlot(seat: number) {
    const play = currentTrick?.plays.find(p => p.seat === seat);
    return (
      <AnimatedTrickSlot
        key={seat}
        seat={seat}
        seatName={seatNames[seat]}
        card={play?.card}
        animIn={trickCardAnims.current[seat]}
        clearAnim={trickClearAnim.current}
        clearTranslate={trickClearTranslate.current}
      />
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />

      {/* Felt background */}
      <FeltBackground />

      {/* Root shake container */}
      <Animated.View style={[styles.rootContainer, { transform: [{ translateX: shakeAnim.current }] }]}>

        {/* ── Live Scoreboard Header ── */}
        <Scoreboard
          scores={scores}
          handPoints={handPoints}
          handTricks={handTricks}
          bidAmount={bidState.currentBid}
          biddingTeam={biddingTeamNum}
          trump={trump ?? null}
          trumpHeaderPulse={trumpHeaderPulse.current}
          scoreScaleAnims={scoreScaleAnims.current}
          scoreColorAnims={scoreColorAnims.current}
          onBack={onBack}
        />

        {/* ── CPU 2 (top / seat 2) ── */}
        <View style={styles.cpuTop}>
          <View style={styles.playerLabelRow}>
            {phase === 'bidding' && dealer === 2 && <View style={styles.dealerChip}><Text style={styles.dealerChipText}>D</Text></View>}
            <Text style={styles.cpuLabel}>{seatNames[2]}</Text>
            {leadSeat === 2 && <Text style={styles.leadStar}>★</Text>}
            <TrumpToken seat={2} bidWinner={bidState.currentBidder} trump={trump ?? null} />
          </View>
          <FaceDownCard count={players[2].hand.length} />
          {activePlayer === 2 && <Text style={styles.turnIndicator}>▼ Their turn</Text>}
        </View>

        {/* ── Middle row ── */}
        <View style={styles.middleRow}>
          <View style={styles.cpuSide}>
            <View style={styles.playerLabelRow}>
              {phase === 'bidding' && dealer === 1 && <View style={styles.dealerChip}><Text style={styles.dealerChipText}>D</Text></View>}
              <Text style={styles.cpuLabel}>{seatNames[1]}</Text>
              {leadSeat === 1 && <Text style={styles.leadStar}>★</Text>}
              <TrumpToken seat={1} bidWinner={bidState.currentBidder} trump={trump ?? null} />
            </View>
            <FaceDownCard count={players[1].hand.length} />
            {activePlayer === 1 && <Text style={styles.turnIndicatorSide}>▶</Text>}
          </View>

          {/* ── Felt Trick Table ── */}
          <View style={styles.feltTable}>
            {/* Corner diamonds */}
            <FeltCornerDiamond style={{ top: 8, left: 8 }} />
            <FeltCornerDiamond style={{ top: 8, right: 8 }} />
            <FeltCornerDiamond style={{ bottom: 8, left: 8 }} />
            <FeltCornerDiamond style={{ bottom: 8, right: 8 }} />

            {/* Felt flash overlay for trick winner */}
            <Animated.View
              pointerEvents="none"
              style={[
                StyleSheet.absoluteFill,
                {
                  borderRadius: 16,
                  opacity: feltFlashAnim.current,
                  backgroundColor: feltFlashTeam === 0 ? 'rgba(184,134,11,1)' : 'rgba(160,0,0,1)',
                },
              ]}
            />

            {/* Card play ripple */}
            {rippleVisible && (
              <Animated.View
                pointerEvents="none"
                style={{
                  position: 'absolute',
                  width: 80, height: 80,
                  borderRadius: 40,
                  borderWidth: 3,
                  borderColor: C.gold,
                  opacity: rippleOpacity.current,
                  transform: [{ scale: rippleScale.current }],
                }}
              />
            )}

            {/* Winner float text */}
            <Animated.Text
              pointerEvents="none"
              style={{
                position: 'absolute',
                color: '#FFD700',
                fontSize: 28,
                fontWeight: '900',
                opacity: winnerFloatOpacity.current,
                transform: [{ translateY: winnerFloatY.current }],
                textShadowColor: 'rgba(0,0,0,0.9)',
                textShadowOffset: { width: 0, height: 1 },
                textShadowRadius: 4,
                zIndex: 100,
              }}
            >
              {winnerFloatText}
            </Animated.Text>

            <View style={styles.trickRow}>{renderTrickSlot(2)}</View>
            <View style={[styles.trickRow, styles.trickMiddle]}>
              {renderTrickSlot(1)}
              <View style={styles.trickCenter}>
                <Text style={styles.trickCount}>{completedTricks.length}/13</Text>
              </View>
              {renderTrickSlot(3)}
            </View>
            <View style={styles.trickRow}>{renderTrickSlot(0)}</View>
          </View>

          <View style={styles.cpuSide}>
            <View style={styles.playerLabelRow}>
              {phase === 'bidding' && dealer === 3 && <View style={styles.dealerChip}><Text style={styles.dealerChipText}>D</Text></View>}
              <Text style={styles.cpuLabel}>{seatNames[3]}</Text>
              {leadSeat === 3 && <Text style={styles.leadStar}>★</Text>}
              <TrumpToken seat={3} bidWinner={bidState.currentBidder} trump={trump ?? null} />
            </View>
            <FaceDownCard count={players[3].hand.length} />
            {activePlayer === 3 && <Text style={styles.turnIndicatorSide}>◀</Text>}
          </View>
        </View>

        {/* ── Status bar ── */}
        <View style={styles.statusBar}>
          <Text style={styles.statusText}>{status}</Text>
        </View>

        {/* ── Action area ── */}
        <View style={styles.actionArea}>
          {isDiscard && (
            <View style={styles.actionRow}>
              <Text style={styles.discardHint}>Tap 5 cards to discard ({selectedDiscard.size}/5)</Text>
              <TouchableOpacity
                style={[styles.actionBtn, styles.actionBtnPrimary, selectedDiscard.size !== 5 && styles.actionBtnDisabled]}
                onPress={humanDiscard}
                disabled={selectedDiscard.size !== 5}
              >
                <Text style={[styles.actionBtnText, styles.actionBtnTextPrimary]}>Confirm Discard</Text>
              </TouchableOpacity>
            </View>
          )}

          {isTrump && (
            <View style={styles.actionRow}>
              {COLOR_NAMES.map(color => (
                <TouchableOpacity
                  key={color}
                  style={[styles.actionBtn, styles.actionBtnPrimary]}
                  onPress={() => humanCallTrump(color)}
                >
                  <Text style={[styles.actionBtnText, styles.actionBtnTextPrimary]}>
                    {SUIT_DOT[color]} {color}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {phase === 'playing' && activePlayer === 0 && (
            <Text style={styles.yourTurnText}>Your turn — tap a card to play</Text>
          )}
        </View>

        {/* ── Player name + dealer chip ── */}
        <View style={styles.playerLabelRow}>
          {phase === 'bidding' && dealer === 0 && <View style={styles.dealerChip}><Text style={styles.dealerChipText}>D</Text></View>}
          <Text style={styles.yourNameLabel}>You</Text>
          {leadSeat === 0 && <Text style={styles.leadStar}>★</Text>}
          <TrumpToken seat={0} bidWinner={bidState.currentBidder} trump={trump ?? null} />
        </View>

        {/* ── Player Hand ── */}
        {Platform.OS === 'web' ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.handContainer}
            style={styles.handScroll}
          >
            {sortHand(humanHand).map(card => (
              <PlayingCard
                key={card.id}
                card={card}
                size="hand"
                valid={validIds.has(card.id) || isDiscard || isTrump}
                selected={selectedDiscard.has(card.id)}
                onPress={
                  isDiscard
                    ? () => toggleDiscard(card)
                    : phase === 'playing' && activePlayer === 0
                    ? () => humanPlayCard(card)
                    : undefined
                }
              />
            ))}
          </ScrollView>
        ) : (
          <View style={styles.handFanContainer}>
            <FannedHand
              cards={sortHand(humanHand)}
              validIds={validIds}
              isDiscard={isDiscard}
              isPlaying={phase === 'playing' && activePlayer === 0}
              selectedDiscard={selectedDiscard}
              playingCardId={playingCardId}
              onCardPress={humanPlayCard}
              onToggleDiscard={toggleDiscard}
            />
          </View>
        )}

      </Animated.View>

      {/* ── Particles (outside shake container so they're full screen) ── */}
      <ParticleBurst particles={particleAnims} active={particlesActive} trump={particleTrump} />
      {/* ── Enhancement 3: Trick Reveal Overlay ── */}
      {trickReveal && (
        <TrickRevealOverlay data={trickReveal} onDone={onTrickRevealDone} />
      )}

      {/* ── Enhancement 1: Bidding Modal ── */}
      {biddingModalVisible && (
        <BiddingModal
          visible={biddingModalVisible}
          slideAnim={biddingModalSlide.current}
          opacityAnim={biddingModalOpacity.current}
          pulseAnim={biddingPulse.current}
          shimmerAnim={shimmerAnim.current}
          state={state}
          bidLog={bidLog}
          onPass={() => humanBid('pass')}
          onBid={humanBid}
          selectedDiscard={selectedDiscard}
          onToggleDiscard={toggleDiscard}
        />
      )}

      {/* ── Enhancement 2: Trump Reveal Modal ── */}
      <TrumpRevealModal
        visible={showTrumpReveal}
        color={trumpRevealColor}
        overlayOpacity={trumpRevealOpacity.current}
        textScale={trumpTextScale.current}
        bannerX={trumpBannerX.current}
      />

      {/* ── Score Modal ── */}
      <DramaticScoreModal
        visible={showScoreModal}
        handResult={handResult}
        scores={scores}
        onNextHand={nextHand}
        onBack={onBack}
        phase={phase}
        winner={state.winner}
        displayScore0={displayScore0}
        displayScore1={displayScore1}
        setDisplayScore0={setDisplayScore0}
        setDisplayScore1={setDisplayScore1}
        bannerScale={scoreModalBannerScale.current}
        bgAnim={scoreModalBgAnim.current}
        majorityX={scoreModalMajorityX.current}
        nextHandPulse={scoreModalNextHandPulse.current}
        countIntervalRef={scoreCountIntervalRef}
      />
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Bidding Modal Styles
// ---------------------------------------------------------------------------

const bStyles = StyleSheet.create({
  titleArea: { alignItems: 'center', paddingTop: 60, paddingBottom: 12 },
  scoreStrip: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 6 },
  scoreStripUs: { color: '#c8960c', fontSize: 16, fontWeight: '900', letterSpacing: 1 },
  scoreStripVs: { color: '#5a4208', fontSize: 14, fontWeight: '700' },
  scoreStripThem: { color: '#c8960c', fontSize: 16, fontWeight: '900', letterSpacing: 1 },
  biddingTitle: {
    fontSize: 42, fontWeight: '900', color: '#c8960c', letterSpacing: 6,
    textShadowColor: 'rgba(200,150,12,0.6)', textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 16,
  },
  currentBidBig: {
    fontSize: 64, fontWeight: '900', color: C.gold, marginTop: 4,
    textShadowColor: 'rgba(200,150,12,0.7)', textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 16,
  },
  yourTurnLabel: {
    fontSize: 20, fontWeight: '900', color: C.gold, letterSpacing: 3, marginTop: 4,
    textShadowColor: 'rgba(200,150,12,0.8)', textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 12,
  },
  cpuThinkingLabel: {
    fontSize: 16, fontWeight: '600', color: '#888888', marginTop: 4,
  },
  lastBidder: { fontSize: 16, color: '#cccccc', marginTop: 4 },
  seatDiamond: { alignItems: 'center', marginVertical: 8 },
  seatTop: { marginBottom: 6 },
  seatMiddle: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  seatBottom: { marginTop: 6 },
  seatCenter: { width: 100, alignItems: 'center' },
  waitingText: { color: '#7a5c2a', fontSize: 11, textAlign: 'center' },
  seatChip: {
    paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20,
    borderWidth: 1.5, borderColor: '#5a4208',
    backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center',
  },
  seatChipActive: {
    borderColor: '#c8960c', backgroundColor: 'rgba(200,150,12,0.15)',
    shadowColor: '#c8960c', shadowOpacity: 0.6, shadowRadius: 8,
  },
  seatChipText: { color: '#7a5c2a', fontSize: 12, fontWeight: '700' },
  seatChipTextActive: { color: '#c8960c' },
  seatBidAmount: { color: '#f0d060', fontSize: 16, fontWeight: '900', textAlign: 'center', marginTop: 2 },
  seatBidPassed: { color: '#8b0000', fontSize: 12, fontWeight: '800', textAlign: 'center', marginTop: 2, letterSpacing: 1 },
  seatDealerChip: { width: 16, height: 16, borderRadius: 8, backgroundColor: '#d4af37', borderWidth: 1.5, borderColor: '#8b7000', alignItems: 'center', justifyContent: 'center' },
  seatDealerChipText: { color: '#1a0a00', fontSize: 9, fontWeight: '900' },
  seatActiveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#c8960c', marginTop: 3 },
  bidLog: { alignItems: 'center', marginVertical: 8, gap: 5, width: '100%', paddingHorizontal: 16 },
  bidLogEntry: { color: '#9a7010', fontSize: 15, textAlign: 'center', fontWeight: '500' },
  bidLogEntryLatest: { color: '#f0d060', fontSize: 18, fontWeight: '800', letterSpacing: 1 },
  buttons: { flexDirection: 'column', justifyContent: 'center', gap: 10, paddingHorizontal: 16, marginBottom: 16 },
  btn: { paddingHorizontal: 20, paddingVertical: 0, borderRadius: 14, alignItems: 'center', height: 56, justifyContent: 'center' },
  btnPass: {
    borderWidth: 2.5, borderColor: '#cc2222',
    backgroundColor: '#6b0000',
    shadowColor: '#cc2222', shadowOpacity: 0.6, shadowRadius: 8,
    minWidth: 100, paddingVertical: 16,
  },
  btnBid: {
    backgroundColor: '#c8960c',
    borderTopWidth: 1, borderTopColor: 'rgba(255,255,200,0.3)',
    shadowColor: '#c8960c', shadowOpacity: 0.6, shadowRadius: 6, shadowOffset: { width: 0, height: 3 },
    minWidth: 120, paddingVertical: 16,
  },
  btnJump: { borderWidth: 2, borderColor: '#c8960c', minWidth: 90, paddingVertical: 16 },
  btnDisabled: { opacity: 0.35 },
  btnPassText: { color: '#ffffff', fontSize: 18, fontWeight: '800' },
  btnBidText: { color: '#1a0a00', fontSize: 18, fontWeight: '900' },
  btnJumpText: { color: '#c8960c', fontSize: 18, fontWeight: '800' },
  handArea: { flex: 1, paddingTop: 8, borderTopWidth: 2, borderTopColor: '#7a5c1a' },
  handLabel: { color: '#c8960c', fontSize: 13, fontWeight: '700', textAlign: 'center', marginBottom: 6, letterSpacing: 2 },
  flatHandScroll: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12, gap: 8, paddingVertical: 8, flexGrow: 1 },
});

// ---------------------------------------------------------------------------
// Trump Reveal Styles
// ---------------------------------------------------------------------------

const trStyles = StyleSheet.create({
  banner: {
    position: 'absolute', left: 0, right: 0, height: 6,
    top: '50%', marginTop: 60, opacity: 0.8,
  },
  trumpName: {
    fontSize: 72, fontWeight: '900', letterSpacing: 8,
    textShadowColor: 'rgba(255,255,255,0.3)', textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 24,
  },
  trumpSub: { fontSize: 28, fontWeight: '800', color: '#c8960c', marginTop: 8, letterSpacing: 4 },
  trumpDot: { fontSize: 48, marginTop: 12 },
});

// ---------------------------------------------------------------------------
// Main Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: C.bg },
  rootContainer: {
    flex: 1,
    ...(Platform.OS === 'web' ? {
      maxWidth: '85%',
      width: '85%',
      alignSelf: 'center' as const,
      borderWidth: 1,
      borderColor: 'rgba(200,150,12,0.3)',
      borderRadius: 12,
      overflow: 'hidden' as const,
    } : {}),
  },

  // Cards
  card: {
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 3,
    position: 'relative',
    elevation: 4,
  },
  cardInvalid: { opacity: 0.75 },
  cardSelected: { borderWidth: 2.5, transform: [{ translateY: -6 }] },
  cardCornerTL: { position: 'absolute', top: 4, left: 5, alignItems: 'flex-start' },
  cardCornerBR: { position: 'absolute', bottom: 4, right: 5, alignItems: 'flex-end' },
  cardValue: { fontWeight: '800', lineHeight: 20 },
  cardCenterDot: {},
  cardPointsBadge: {
    position: 'absolute', bottom: 5, alignSelf: 'center',
    paddingHorizontal: 5, paddingVertical: 1, borderRadius: 6,
    minWidth: 18, alignItems: 'center',
  },

  // CPU
  cpuTop: { alignItems: 'center', paddingVertical: 4 },
  cpuLabel: {
    color: C.textMuted, fontSize: 11, marginBottom: 2,
    letterSpacing: 1, textTransform: 'uppercase',
  },
  playerLabelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, marginBottom: 2 },
  dealerChip: {
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: '#d4af37',
    borderWidth: 2, borderColor: '#8b7000',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#d4af37', shadowOpacity: 0.6, shadowRadius: 4, elevation: 4,
  },
  dealerChipText: { color: '#1a0a00', fontSize: 11, fontWeight: '900' },
  yourNameLabel: { color: C.textMuted, fontSize: 11, letterSpacing: 1, textTransform: 'uppercase' },
  leadStar: { color: '#f0d060', fontSize: 13, lineHeight: 16 },
  cpuSide: { alignItems: 'center', width: 72 },
  turnIndicator: {
    color: C.gold, fontSize: 10, marginTop: 2,
    textShadowColor: C.goldGlow, textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 4,
  },
  turnIndicatorSide: {
    color: C.gold, fontSize: 12, marginTop: 2,
    textShadowColor: C.goldGlow, textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 4,
  },

  // Face-down cards
  faceDownStack: { alignItems: 'center' },
  faceDownCard: {
    width: 42, height: 58, borderRadius: 8,
    backgroundColor: '#0a1a0a',
    borderWidth: 1.5, borderColor: C.gold,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: C.gold, shadowOpacity: 0.3, shadowRadius: 4,
  },
  faceDownText: { fontSize: 18, zIndex: 1 },
  faceDownBadge: {
    position: 'absolute',
    top: -6, right: -6,
    width: 16, height: 16, borderRadius: 8,
    backgroundColor: C.gold, alignItems: 'center', justifyContent: 'center',
  },
  faceDownCount: { color: '#1a0a00', fontSize: 9, fontWeight: '900' },

  // Middle
  middleRow: { flexDirection: 'row', flex: 1, alignItems: 'center', paddingHorizontal: 4 },

  // Felt trick table — faded dusty felt inset into worn table
  feltTable: {
    flex: 1,
    backgroundColor: '#3a4a30',
    borderRadius: 16,
    padding: 16,
    borderWidth: 8,
    borderColor: '#3a2510',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.8,
    shadowRadius: 10,
    elevation: 8,
    position: 'relative',
  },
  trickRow: { alignItems: 'center', justifyContent: 'center' },
  trickMiddle: { flexDirection: 'row', alignItems: 'center', gap: 4, marginVertical: 4 },
  trickCenter: { width: 36, alignItems: 'center' },
  trickCount: {
    color: C.textMuted, fontSize: 10,
    textShadowColor: C.goldGlow, textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 3,
  },
  trickSlot: { alignItems: 'center', marginHorizontal: 2 },
  trickSeatLabel: { color: 'rgba(122,108,58,0.6)', fontSize: 9, marginBottom: 2 },
  trickEmpty: {
    width: 65, height: 92, borderRadius: 10, borderWidth: 1,
    borderColor: 'rgba(26,58,26,0.6)', borderStyle: 'dashed',
    alignItems: 'center', justifyContent: 'center',
  },
  trickEmptyDot: { color: 'rgba(26,58,26,0.5)', fontSize: 24 },

  // Status
  statusBar: { paddingHorizontal: 12, paddingVertical: 4, backgroundColor: 'rgba(0,0,0,0.4)' },
  statusText: { color: C.gold, fontSize: 14, textAlign: 'center', fontWeight: '600',
    textShadowColor: C.goldGlow, textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 4 },

  // Actions
  actionArea: { minHeight: 48, paddingHorizontal: 12, paddingVertical: 6, alignItems: 'center' },
  actionRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center' },
  actionBtn: {
    paddingHorizontal: 20, paddingVertical: 14, borderRadius: 14,
    borderWidth: 1, borderColor: C.gold,
    shadowColor: C.gold, shadowOpacity: 0.3, shadowRadius: 4, shadowOffset: { width: 0, height: 2 },
  },
  actionBtnPrimary: {
    backgroundColor: C.gold,
    borderTopWidth: 1, borderTopColor: 'rgba(255,255,200,0.3)',
    shadowColor: C.goldDim, shadowOpacity: 0.6, shadowRadius: 6, shadowOffset: { width: 0, height: 3 },
  },
  actionBtnDisabled: { opacity: 0.4 },
  actionBtnText: {
    color: C.gold, fontSize: 13, fontWeight: '700',
    textShadowColor: C.goldGlow, textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 3,
  },
  actionBtnTextPrimary: { color: C.bg, textShadowColor: 'transparent' },
  discardHint: { color: C.textMuted, fontSize: 12 },
  yourTurnText: {
    color: C.gold, fontSize: 12,
    textShadowColor: C.goldGlow, textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 4,
  },

  // Hand web fallback
  handScroll: { maxHeight: 130, width: '100%', borderTopWidth: 1, borderTopColor: C.goldDim },
  handContainer: { paddingHorizontal: 8, paddingVertical: 8, alignItems: 'center', flexGrow: 1, justifyContent: 'center' },

  // Hand native fan
  handFanContainer: { height: 180, width: '100%', borderTopWidth: 1, borderTopColor: C.goldDim, overflow: 'visible' },

  // Score modal
  modalOverlay: { flex: 1, backgroundColor: C.dimOverlay, justifyContent: 'center' },
  modalScrollContent: { alignItems: 'center', paddingVertical: 40 },
  modalBox: {
    backgroundColor: '#0d1a0d', borderRadius: 16, padding: 24, width: '85%',
    borderWidth: 2, borderColor: C.gold, alignItems: 'center',
    shadowColor: C.gold, shadowOpacity: 0.3, shadowRadius: 16,
  },
  modalTitle: {
    color: C.gold, fontSize: 22, fontWeight: '900', marginBottom: 12,
    letterSpacing: 2,
    textShadowColor: C.goldGlow, textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 8,
  },
  modalLine: { color: C.white, fontSize: 14, marginBottom: 6 },
  modalScoreRow: { flexDirection: 'row', gap: 24, marginVertical: 12 },
  modalScoreCol: { alignItems: 'center' },
  modalScoreTeam: { color: C.textMuted, fontSize: 12, marginBottom: 4 },
  modalScoreNum: { color: C.white, fontSize: 20, fontWeight: '700' },
  modalScoreTotal: { color: C.gold, fontSize: 13 },
  modalWinner: { color: C.gold, fontSize: 16, fontWeight: '800', marginBottom: 12, textAlign: 'center' },
  modalBtns: { flexDirection: 'row', gap: 12, marginTop: 8 },

  winningHandSection: {
    width: '100%', marginTop: 12, marginBottom: 8,
    borderTopWidth: 1, borderTopColor: C.goldDim, paddingTop: 12, alignItems: 'center',
  },
  winningHandTitle: { color: C.gold, fontSize: 14, fontWeight: '800', marginBottom: 2, textAlign: 'center' },
  winningHandSubtitle: { color: C.textMuted, fontSize: 11, marginBottom: 8 },
  winningCardsScroll: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 4, paddingHorizontal: 4 },
  miniCardWrapper: { margin: 2 },
});

// ---------------------------------------------------------------------------
// Dramatic Score Modal Styles
// ---------------------------------------------------------------------------

const dmStyles = StyleSheet.create({
  bidResultText: {
    fontSize: 48,
    fontWeight: '900',
    textAlign: 'center',
    marginBottom: 6,
    letterSpacing: 1,
  },
  teamWonText: {
    fontSize: 28,
    fontWeight: '900',
    textAlign: 'center',
    marginBottom: 10,
    letterSpacing: 2,
  },
  teamScoreRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '80%',
    marginVertical: 5,
    paddingHorizontal: 8,
    borderRadius: 10,
    paddingVertical: 4,
  },
  teamScoreRowWinner: {
    borderWidth: 2,
    borderColor: '#FFD700',
    backgroundColor: 'rgba(255,215,0,0.08)',
    shadowColor: '#FFD700',
    shadowOpacity: 0.7,
    shadowRadius: 10,
  },
  teamScoreLabel: {
    color: C.white,
    fontSize: 16,
    fontWeight: '700',
  },
  teamScoreCount: {
    fontSize: 30,
    fontWeight: '900',
  },
  majorityRow: {
    marginTop: 8,
    marginBottom: 4,
    alignSelf: 'flex-end',
    paddingRight: 12,
  },
  majorityText: {
    color: '#FFD700',
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 1,
    textShadowColor: 'rgba(255,215,0,0.4)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 6,
  },
  gameScoreSection: {
    marginTop: 14,
    alignItems: 'center',
    width: '100%',
    borderTopWidth: 1,
    borderTopColor: C.goldDim,
    paddingTop: 10,
  },
  gameScoreLabel: {
    color: C.textMuted,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 3,
    marginBottom: 6,
  },
  gameScoreArrows: {
    flexDirection: 'row',
    gap: 32,
  },
  gameScoreCol: {
    alignItems: 'center',
  },
  gameScoreTeam: {
    color: C.textMuted,
    fontSize: 11,
    marginBottom: 2,
  },
  gameScoreArrow: {
    color: C.gold,
    fontSize: 20,
    fontWeight: '900',
    textShadowColor: C.goldGlow,
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 6,
  },
  nextHandBtn: {
    paddingHorizontal: 36,
    paddingVertical: 16,
    shadowColor: C.gold,
    shadowOpacity: 0.6,
    shadowRadius: 10,
  },
  nextHandBtnText: {
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: 2,
  },
});
