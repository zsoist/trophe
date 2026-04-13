'use client';
/* eslint-disable @next/next/no-img-element */

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Image as ImageIcon, X, ChevronDown, ChevronUp } from 'lucide-react';
import { supabase } from '@/lib/supabase';

interface MealPhotoGalleryProps {
  userId: string;
}

interface PhotoEntry {
  id: string;
  food_name: string;
  photo_url: string;
  logged_date: string;
  calories: number;
}

// F57: Meal photo gallery — timeline of food photos
export default function MealPhotoGallery({ userId }: MealPhotoGalleryProps) {
  const [photos, setPhotos] = useState<PhotoEntry[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [selected, setSelected] = useState<PhotoEntry | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from('food_log')
        .select('id, food_name, photo_url, logged_date, calories')
        .eq('user_id', userId)
        .not('photo_url', 'is', null)
        .order('created_at', { ascending: false })
        .limit(20);

      if (data) setPhotos(data.filter(d => d.photo_url));
      setLoading(false);
    };
    load();
  }, [userId]);

  if (loading || photos.length === 0) return null;

  return (
    <>
      <div className="glass p-3">
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center justify-between w-full"
        >
          <div className="flex items-center gap-2">
            <ImageIcon size={14} className="gold-text" />
            <span className="text-stone-300 text-xs font-medium">Photo Gallery</span>
            <span className="text-stone-600 text-[10px]">({photos.length})</span>
          </div>
          {expanded ? <ChevronUp size={12} className="text-stone-500" /> : <ChevronDown size={12} className="text-stone-500" />}
        </button>

        <AnimatePresence>
          {expanded && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mt-3 grid grid-cols-4 gap-1.5 overflow-hidden"
            >
              {photos.map((photo, i) => (
                <motion.button
                  key={photo.id}
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: i * 0.03 }}
                  onClick={() => setSelected(photo)}
                  className="aspect-square rounded-lg overflow-hidden border border-white/[0.05] hover:border-[#D4A853]/30 transition-colors"
                >
                  <img
                    src={photo.photo_url}
                    alt={photo.food_name}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                </motion.button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Full-screen photo viewer */}
      <AnimatePresence>
        {selected && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/90 flex flex-col items-center justify-center p-4"
            onClick={() => setSelected(null)}
          >
            <button className="absolute top-4 right-4 text-white/50 hover:text-white">
              <X size={24} />
            </button>
            <img
              src={selected.photo_url}
              alt={selected.food_name}
              className="max-w-full max-h-[70vh] rounded-xl object-contain"
            />
            <div className="mt-3 text-center">
              <p className="text-white text-sm font-medium">{selected.food_name}</p>
              <p className="text-white/50 text-xs">{selected.logged_date} · {selected.calories} kcal</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
