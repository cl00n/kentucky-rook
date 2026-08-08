import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  StatusBar,
  Platform,
  Modal,
} from 'react-native';
import GameBoardScreen from './src/screens/GameBoardScreen';
import { Difficulty } from './src/engine/types';

const COLORS = {
  bg: '#1a0a00',
  gold: '#c8960c',
  goldMuted: '#9a7010',
  goldDim: '#5a4208',
  red: '#8b0000',
  white: '#ffffff',
  cardBg: '#fdf6e3',
  textMuted: '#7a5c2a',
};

function RookCard() {
  return (
    <View style={styles.cardOuter}>
      <View style={styles.card}>
        {/* Top left corner */}
        <View style={styles.cardCornerTL}>
          <Text style={styles.cardCornerLabel}>R</Text>
          <Text style={styles.cardCornerSuit}>🐦</Text>
        </View>

        {/* Center */}
        <View style={styles.cardCenter}>
          <Text style={styles.cardBirdEmoji}>🐦</Text>
          <Text style={styles.cardRookText}>ROOK</Text>
        </View>

        {/* Bottom right corner (rotated) */}
        <View style={styles.cardCornerBR}>
          <Text style={styles.cardCornerLabel}>R</Text>
          <Text style={styles.cardCornerSuit}>🐦</Text>
        </View>
      </View>
    </View>
  );
}

interface ButtonProps {
  label: string;
  variant?: 'primary' | 'outline';
  onPress?: () => void;
}

function GameButton({ label, variant = 'primary', onPress }: ButtonProps) {
  return (
    <TouchableOpacity
      style={[styles.button, variant === 'outline' ? styles.buttonOutline : styles.buttonPrimary]}
      onPress={onPress}
      activeOpacity={0.75}
    >
      <Text style={[styles.buttonText, variant === 'outline' ? styles.buttonTextOutline : styles.buttonTextPrimary]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

interface DifficultyOption {
  difficulty: Difficulty;
  label: string;
  subtitle: string;
  color: string;
  textColor: string;
}

const DIFFICULTY_OPTIONS: DifficultyOption[] = [
  {
    difficulty: 'easy',
    label: 'Easy',
    subtitle: 'Beginner friendly',
    color: '#2d5a27',
    textColor: '#7eda6e',
  },
  {
    difficulty: 'medium',
    label: 'Medium',
    subtitle: 'Plays smart',
    color: '#5a4208',
    textColor: '#c8960c',
  },
  {
    difficulty: 'hard',
    label: 'Hard',
    subtitle: 'Good luck 😈',
    color: '#5a1a1a',
    textColor: '#e05050',
  },
];

interface DifficultyPickerProps {
  visible: boolean;
  onSelect: (difficulty: Difficulty) => void;
  onCancel: () => void;
}

function DifficultyPicker({ visible, onSelect, onCancel }: DifficultyPickerProps) {
  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={dpStyles.overlay}>
        <View style={dpStyles.sheet}>
          <Text style={dpStyles.title}>Choose Difficulty</Text>
          <Text style={dpStyles.subtitle}>How tough do you want the CPU to play?</Text>

          {DIFFICULTY_OPTIONS.map((opt) => (
            <TouchableOpacity
              key={opt.difficulty}
              style={[dpStyles.optionBtn, { backgroundColor: opt.color, borderColor: opt.textColor }]}
              onPress={() => onSelect(opt.difficulty)}
              activeOpacity={0.8}
            >
              <Text style={[dpStyles.optionLabel, { color: opt.textColor }]}>{opt.label}</Text>
              <Text style={[dpStyles.optionSubtitle, { color: opt.textColor, opacity: 0.75 }]}>{opt.subtitle}</Text>
            </TouchableOpacity>
          ))}

          <TouchableOpacity style={dpStyles.cancelBtn} onPress={onCancel} activeOpacity={0.75}>
            <Text style={dpStyles.cancelText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const dpStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#1a0a00',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 2,
    borderTopColor: '#5a4208',
    paddingHorizontal: 24,
    paddingTop: 28,
    paddingBottom: 40,
    gap: 12,
  },
  title: {
    fontSize: 24,
    fontWeight: '900',
    color: '#c8960c',
    textAlign: 'center',
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
    letterSpacing: 1,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 13,
    color: '#7a5c2a',
    textAlign: 'center',
    fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
    marginBottom: 8,
  },
  optionBtn: {
    borderRadius: 14,
    borderWidth: 1.5,
    paddingVertical: 18,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  optionLabel: {
    fontSize: 20,
    fontWeight: '800',
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
    letterSpacing: 1,
  },
  optionSubtitle: {
    fontSize: 13,
    marginTop: 4,
    fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
  },
  cancelBtn: {
    marginTop: 4,
    paddingVertical: 14,
    alignItems: 'center',
  },
  cancelText: {
    color: '#7a5c2a',
    fontSize: 16,
    fontWeight: '600',
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
  },
});

function HomeScreen({ onPlayComputer }: { onPlayComputer: () => void }) {
  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.bg} />
      <View style={styles.container}>
        {/* Version badge */}
        <Text style={styles.version}>v0.1.0</Text>

        {/* Title block */}
        <View style={styles.titleBlock}>
          <Text style={styles.title}>Kentucky Rook</Text>
          <Text style={styles.subtitle}>Kimberley Rules</Text>
        </View>

        {/* Decorative Rook card */}
        <RookCard />

        {/* Buttons */}
        <View style={styles.buttonGroup}>
          <GameButton label="Play vs Computer" variant="primary" onPress={onPlayComputer} />
          <GameButton label="Play Online" variant="primary" />
          <GameButton label="How to Play" variant="outline" />
          <GameButton label="Settings" variant="outline" />
        </View>

        {/* Footer */}
        <Text style={styles.footer}>To 500 Points • Kimberley Rules</Text>
      </View>
    </SafeAreaView>
  );
}

export default function App() {
  const [screen, setScreen] = useState<'home' | 'game'>('home');
  const [showDifficultyPicker, setShowDifficultyPicker] = useState(false);
  const [difficulty, setDifficulty] = useState<Difficulty>('medium');

  function handlePlayComputer() {
    setShowDifficultyPicker(true);
  }

  function handleDifficultySelect(d: Difficulty) {
    setDifficulty(d);
    setShowDifficultyPicker(false);
    setScreen('game');
  }

  if (screen === 'game') {
    return <GameBoardScreen onBack={() => setScreen('home')} difficulty={difficulty} />;
  }

  return (
    <>
      <HomeScreen onPlayComputer={handlePlayComputer} />
      <DifficultyPicker
        visible={showDifficultyPicker}
        onSelect={handleDifficultySelect}
        onCancel={() => setShowDifficultyPicker(false)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  container: {
    flex: 1,
    backgroundColor: COLORS.bg,
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 28,
    paddingHorizontal: 24,
  },

  // Version
  version: {
    alignSelf: 'flex-end',
    color: COLORS.textMuted,
    fontSize: 11,
    fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
    letterSpacing: 1,
  },

  // Title
  titleBlock: {
    alignItems: 'center',
    marginTop: 4,
  },
  title: {
    fontSize: 42,
    fontWeight: '900',
    color: COLORS.gold,
    letterSpacing: 2,
    textAlign: 'center',
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
    textShadowColor: 'rgba(200,150,12,0.4)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8,
  },
  subtitle: {
    fontSize: 14,
    color: COLORS.goldMuted,
    letterSpacing: 3,
    marginTop: 6,
    textTransform: 'uppercase',
    fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
  },

  // Card
  cardOuter: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    elevation: 12,
  },
  card: {
    width: 160,
    height: 220,
    backgroundColor: COLORS.cardBg,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: COLORS.goldDim,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    shadowColor: COLORS.gold,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
  },
  cardCornerTL: {
    position: 'absolute',
    top: 10,
    left: 12,
    alignItems: 'center',
  },
  cardCornerBR: {
    position: 'absolute',
    bottom: 10,
    right: 12,
    alignItems: 'center',
    transform: [{ rotate: '180deg' }],
  },
  cardCornerLabel: {
    fontSize: 16,
    fontWeight: '900',
    color: COLORS.red,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
    lineHeight: 18,
  },
  cardCornerSuit: {
    fontSize: 12,
    lineHeight: 14,
  },
  cardCenter: {
    alignItems: 'center',
  },
  cardBirdEmoji: {
    fontSize: 56,
    lineHeight: 64,
  },
  cardRookText: {
    fontSize: 13,
    fontWeight: '800',
    color: COLORS.red,
    letterSpacing: 4,
    marginTop: 4,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
  },

  // Buttons
  buttonGroup: {
    width: '100%',
    maxWidth: 340,
    gap: 12,
  },
  button: {
    width: '100%',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonPrimary: {
    backgroundColor: COLORS.gold,
    shadowColor: COLORS.gold,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 6,
  },
  buttonOutline: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: COLORS.gold,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 1,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
  },
  buttonTextPrimary: {
    color: COLORS.bg,
  },
  buttonTextOutline: {
    color: COLORS.gold,
  },

  // Footer
  footer: {
    color: COLORS.textMuted,
    fontSize: 12,
    letterSpacing: 2,
    textTransform: 'uppercase',
    fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
  },
});
