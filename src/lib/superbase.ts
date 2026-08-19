import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://tgcamohglqnrhbpxjyjr.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRnY2Ftb2hnbHFucmhicHhqeWpyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ5ODcyNjcsImV4cCI6MjEwMDU2MzI2N30.3RSxhY1ZRb2Sro-I_nVlXEYsXl8Ws-zowiJdXaewcV8';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);