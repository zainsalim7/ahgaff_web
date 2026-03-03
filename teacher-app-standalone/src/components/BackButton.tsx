import React from 'react';
import { TouchableOpacity, Text, StyleSheet, View, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';

interface BackButtonProps {
  label?: string;
  onPress?: () => void;
  style?: any;
  showHomeButton?: boolean;
}

/**
 * زر العودة المحسّن - يعمل بشكل صحيح على الويب والموبايل
 */
export const BackButton: React.FC<BackButtonProps> = ({ 
  label = 'رجوع', 
  onPress,
  style,
  showHomeButton = true 
}) => {
  
  const handleBack = () => {
    if (onPress) {
      onPress();
      return;
    }
    
    // على الويب، نتحقق من history
    if (Platform.OS === 'web') {
      if (window.history.length > 1) {
        window.history.back();
      } else {
        router.replace('/');
      }
    } else {
      // على الموبايل
      if (router.canGoBack()) {
        router.back();
      } else {
        router.replace('/');
      }
    }
  };

  const handleHome = () => {
    router.replace('/');
  };

  return (
    <View style={[styles.container, style]}>
      <TouchableOpacity 
        style={styles.backButton} 
        onPress={handleBack}
        accessibilityLabel="العودة للصفحة السابقة"
      >
        <Ionicons name="arrow-forward" size={24} color="#1565c0" />
        {label && <Text style={styles.backText}>{label}</Text>}
      </TouchableOpacity>
      
      {showHomeButton && (
        <TouchableOpacity 
          style={styles.homeButton} 
          onPress={handleHome}
          accessibilityLabel="العودة للرئيسية"
        >
          <Ionicons name="home" size={20} color="#666" />
        </TouchableOpacity>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 8,
    gap: 4,
  },
  backText: {
    fontSize: 16,
    color: '#1565c0',
    fontWeight: '500',
  },
  homeButton: {
    padding: 8,
    borderRadius: 20,
    backgroundColor: '#f5f5f5',
  },
});

export default BackButton;
